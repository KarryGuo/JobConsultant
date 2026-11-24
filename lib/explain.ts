import { readEnv } from "./env";
import { buildTemplateReport } from "./template";
import type { Hit, ReportDraft } from "./types";
import { ModelOutputSchema, ReportDraftSchema } from "./validation";

const DEFAULT_MODEL_TIMEOUT_MS = 8000;
const MAX_OUTPUT_TOKENS = 1200;
const FORBIDDEN_WORDS = [
  "垃圾",
  "骗子公司",
  "骗子",
  "骗人",
  "黑心",
  "坑人",
  "无良",
  "烂公司",
];

type ModelPoint = {
  text: string;
  ruleId: string;
  benign: string;
  action: string;
};

function containsForbidden(value: string): boolean {
  return FORBIDDEN_WORDS.some((word) => value.includes(word));
}

function collectAllowedNumbers(hit: Hit): Set<string> {
  const allowed = new Set<string>();

  const visit = (value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      allowed.add(String(value));
      if (Math.abs(value) <= 1) {
        allowed.add(String(Math.round(value * 100)));
      }
      return;
    }

    if (typeof value === "string") {
      for (const token of value.match(/\d+(?:\.\d+)?/g) ?? []) {
        allowed.add(token);
        allowed.add(String(Number(token)));
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    if (value && typeof value === "object") {
      Object.values(value).forEach(visit);
    }
  };

  visit(hit.facts);
  return allowed;
}

function hasOnlyKnownNumbers(text: string, allowed: Set<string>): boolean {
  const tokens = text.match(/\d+(?:\.\d+)?/g) ?? [];
  return tokens.every((token) => allowed.has(token));
}

function buildPrompt(companyName: string, hits: Hit[]): string {
  const payload = {
    company: companyName,
    hits: hits.map((hit) => ({
      ruleId: hit.ruleId,
      ruleName: hit.ruleName,
      severity: hit.severity,
      benignOptions: hit.benignOptions,
      action: hit.action,
      facts: hit.facts.map((fact) => ({
        type: fact.type,
        period: fact.period,
        value: fact.value,
        sourceTitle: fact.sourceTitle,
        sourcePublishedAt: fact.sourcePublishedAt,
      })),
    })),
  };

  return [
    "你是“职顾问”的报告措辞模块。",
    "你只能复述输入 JSON 中已经存在的数字和事实，不得引入任何外部知识，不得推测。",
    "输出必须是 JSON，不要任何额外文字。",
    "输出格式：",
    '{"conclusion":"不超过40字","points":[{"text":"必须包含输入中的原始数字","ruleId":"输入的规则ID","benign":"只能从该规则的 benignOptions 中选一条","action":"只能使用该规则的 action"}]}',
    "禁止使用评价性词汇：垃圾、骗子公司、骗子、骗人、黑心、坑人、无良、烂公司。",
    "语气是提醒，不是审判。",
    "输入：",
    JSON.stringify(payload),
  ].join("\n");
}

async function callModelOnce(
  companyName: string,
  hits: Hit[],
): Promise<{ conclusion: string; points: ModelPoint[] } | null> {
  const apiKey = readEnv("MODEL_API_KEY");
  if (!apiKey) return null;

  const baseUrl = (readEnv("MODEL_BASE_URL") ?? "https://api.deepseek.com/v1").replace(
    /\/$/,
    "",
  );
  const model = readEnv("MODEL_NAME") ?? "deepseek-flash";
  const configuredTimeout = Number(readEnv("MODEL_TIMEOUT_MS") ?? "");
  const timeoutMs =
    Number.isFinite(configuredTimeout) && configuredTimeout >= 1000
      ? configuredTimeout
      : DEFAULT_MODEL_TIMEOUT_MS;
  const isDeepSeek = /deepseek\.com/i.test(baseUrl);

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: MAX_OUTPUT_TOKENS,
      response_format: { type: "json_object" },
      // DeepSeek 默认开启思考模式，会先输出思维链并忽略 temperature；
      // 报告措辞不需要推理，显式关闭以降低延迟和 token 消耗。
      ...(isDeepSeek ? { thinking: { type: "disabled" } } : {}),
      messages: [
        {
          role: "system",
          content: "你只输出合法 JSON，不补充任何输入之外的事实。",
        },
        { role: "user", content: buildPrompt(companyName, hits) },
      ],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    console.warn("model request failed", {
      model,
      status: response.status,
    });
    return null;
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    console.warn("model returned empty content", { model });
    return null;
  }

  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    console.warn("model returned invalid json", { model });
    return null;
  }

  const parsed = ModelOutputSchema.safeParse(json);
  if (!parsed.success) {
    console.warn("model output schema mismatch", { model });
    return null;
  }

  return parsed.data;
}

/**
 * 解释层：有模型时用模型改写，任何失败都回落到模板。
 * 模板永远可用，报告不会因为模型故障而消失。
 */
export async function explain(
  companyName: string,
  hits: Hit[],
  dataCutoff: Date | null,
): Promise<ReportDraft> {
  const fallback = buildTemplateReport(hits, dataCutoff);

  if (!readEnv("MODEL_API_KEY") || hits.length === 0) {
    return fallback;
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const output = await callModelOnce(companyName, hits);
      if (!output) continue;

      const points = output.points
        .map((point) => {
          const hit = hits.find((item) => item.ruleId === point.ruleId);
          if (!hit) return null;
          if (!hasOnlyKnownNumbers(point.text, collectAllowedNumbers(hit))) {
            return null;
          }
          if (
            containsForbidden(point.text) ||
            containsForbidden(point.benign) ||
            containsForbidden(point.action)
          ) {
            return null;
          }
          if (!hit.benignOptions.includes(point.benign)) return null;
          if (point.action !== hit.action) return null;

          return {
            text: point.text,
            ruleId: hit.ruleId,
            signalIds: hit.signalIds,
            severity: hit.severity,
            benign: point.benign,
            action: point.action,
            questions: hit.questions.slice(0, 3),
          };
        })
        .filter((point): point is NonNullable<typeof point> => point !== null);

      if (points.length === 0) continue;

      // 结论超过 40 字、包含输入之外的数字或禁用词时，
      // 保留模型写的条目，结论改用模板的安全版本。
      const conclusionLength = Array.from(output.conclusion).length;
      const allowedConclusionNumbers = new Set<string>();
      for (const hit of hits) {
        for (const number of collectAllowedNumbers(hit)) {
          allowedConclusionNumbers.add(number);
        }
      }
      const conclusionUsable =
        conclusionLength <= 40 &&
        hasOnlyKnownNumbers(output.conclusion, allowedConclusionNumbers) &&
        !containsForbidden(output.conclusion);
      const conclusion = conclusionUsable
        ? output.conclusion
        : fallback.conclusion;

      if (!conclusionUsable) {
        console.warn("model conclusion rejected, using template conclusion", {
          model: readEnv("MODEL_NAME") ?? "deepseek-flash",
          length: conclusionLength,
        });
      }

      const candidate: ReportDraft = {
        conclusion,
        points,
        status: "ok",
        modelVersion: `model:${readEnv("MODEL_NAME") ?? "default"}`,
        dataCutoff,
      };

      // 最后一道闸：模型输出和报告 schema 必须完全一致，
      // 任何字段不合格都退回模板，不能让页面 500。
      const validated = ReportDraftSchema.safeParse(candidate);
      if (!validated.success) {
        console.warn("model report validation failed", {
          model: readEnv("MODEL_NAME") ?? "deepseek-flash",
          issues: validated.error.issues.map((issue) => issue.message),
        });
        continue;
      }

      return validated.data;
    } catch (error) {
      // 超时、网络错误、非法 JSON、校验失败：记录原因并重试，仍失败走模板。
      console.warn("model explain attempt failed", {
        model: readEnv("MODEL_NAME") ?? "deepseek-flash",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.warn("model fallback to template", {
    companyName,
    hits: hits.length,
  });
  return fallback;
}
