import { createHash } from "node:crypto";
import { prisma } from "./db";
import { readEnv } from "./env";
import { explain } from "./explain";
import { evaluateRules, RULES_VERSION } from "./rules";
import { TEMPLATE_VERSION } from "./template";
import type { SignalLike } from "./types";
import { ReportDraftSchema, assertReportAgainstHits } from "./validation";

const PIPELINE_VERSION = "v4";

/**
 * 模型开关/模型名变化时必须生成新报告，
 * 否则当天缓存会继续返回旧模型或模板生成的措辞。
 */
function modelCacheKey(): string {
  if (!readEnv("MODEL_API_KEY")) return "template";
  const baseUrl =
    readEnv("MODEL_BASE_URL") ?? "https://api.deepseek.com/v1";
  const model = readEnv("MODEL_NAME") ?? "deepseek-flash";
  return `${baseUrl}|${model}`;
}

function buildCacheKey(
  companyId: string,
  signals: Array<{
    id: string;
    snapshotHash: string;
    fetchedAt: Date;
    correctedAt?: Date | null;
    correctionNote?: string | null;
  }>,
): { cacheKey: string; inputHash: string } {
  // 缓存键只由输入决定，不含“当天日期”：
  // 报告可以长期复用，导入/复核/规则/模板变化时才重新生成。
  const material = [
    PIPELINE_VERSION,
    RULES_VERSION,
    TEMPLATE_VERSION,
    modelCacheKey(),
    ...signals
      .map(
        (signal) =>
          `${signal.id}:${signal.snapshotHash}:${signal.fetchedAt.toISOString()}:${
            signal.correctedAt?.toISOString() ?? ""
          }:${signal.correctionNote ?? ""}`,
      )
      .sort(),
  ].join("|");
  const inputHash = createHash("sha256").update(material).digest("hex").slice(0, 16);
  return {
    cacheKey: `${companyId}:${inputHash}`,
    inputHash,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

export async function getCompanyReport(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: {
      signals: {
        orderBy: [{ sourcePublishedAt: "desc" }, { fetchedAt: "desc" }],
      },
    },
  });

  if (!company) return null;

  // 已作废的信号不再参与规则判定、时间线和证据展示。
  const activeSignals = company.signals.filter(
    (signal) => signal.invalidatedAt === null,
  );
  const companyView = { ...company, signals: activeSignals };

  const feedbacks = await prisma.interviewFeedback.findMany({
    where: { companyId },
    select: {
      roundsBand: true,
      daysToResultBand: true,
      askedPrivacy: true,
      testTaskBand: true,
      rejectionBand: true,
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const { cacheKey, inputHash } = buildCacheKey(companyId, activeSignals);
  const cached = await prisma.report.findUnique({ where: { cacheKey } });
  if (cached) {
    return {
      company: companyView,
      signals: activeSignals,
      report: cached,
      feedbacks,
    };
  }

  const signals: SignalLike[] = activeSignals.map((signal) => ({
    id: signal.id,
    type: signal.type,
    period: signal.period,
    value: signal.value,
    severity: signal.severity,
    sourceUrl: signal.sourceUrl,
    sourceTitle: signal.sourceTitle,
    sourcePublishedAt: signal.sourcePublishedAt,
    fetchedAt: signal.fetchedAt,
    snapshotHash: signal.snapshotHash,
    snapshotPath: signal.snapshotPath,
  }));

  const hits = evaluateRules(signals);
  const dataCutoff = signals.reduce<Date | null>(
    (latest, signal) =>
      !latest || signal.fetchedAt.getTime() > latest.getTime() ? signal.fetchedAt : latest,
    null,
  );

  const draft = await explain(company.name, hits, dataCutoff);
  const parsed = ReportDraftSchema.parse(draft);
  assertReportAgainstHits(parsed, hits);

  try {
    const report = await prisma.report.upsert({
      where: { cacheKey },
      update: {},
      create: {
        companyId,
        cacheKey,
        conclusion: parsed.conclusion,
        points: parsed.points,
        status: parsed.status,
        dataCutoff: parsed.dataCutoff,
        modelVersion: parsed.modelVersion,
        inputsHash: inputHash,
        rulesVersion: RULES_VERSION,
        templateVersion: TEMPLATE_VERSION,
      },
    });

    return {
      company: companyView,
      signals: activeSignals,
      report,
      feedbacks,
    };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const report = await prisma.report.findUnique({ where: { cacheKey } });
      if (report) {
        return {
          company: companyView,
          signals: activeSignals,
          report,
          feedbacks,
        };
      }
    }
    throw error;
  }
}
