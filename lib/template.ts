import {
  formatDate,
  formatMonth,
  formatNumber,
  formatPercent,
  formatPeriod,
  formatYuan,
} from "./format";
import type { Hit, HitFact, ReportDraft, ReportPoint } from "./types";

export const TEMPLATE_VERSION = "template-v2";

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function formatYuanRange(minYuan: number, maxYuan: number): string {
  return `${formatNumber(minYuan / 10000)}–${formatNumber(maxYuan / 10000)} 万元`;
}

/**
 * 良性解释优先选择“不替案件下结论”的选项。
 * “已整改/已解决”只有在来源明确支持时才适合放在第一位；
 * 模板无法确认时，优先展示“仍在程序中/仍在调查中”。
 */
function chooseBenign(hit: Hit, subtype: string): string {
  const preferredWords =
    subtype === "wage_arrears"
      ? ["司法程序", "执行程序"]
      : subtype === "wage_arrears_resolved"
        ? ["已全部支付", "已支付", "已解决"]
        : subtype === "social_insurance"
          ? ["行政程序", "整改"]
          : subtype === "employment_scam"
            ? ["调查", "认定", "处理"]
            : [];

  const matched = hit.benignOptions.find((option) =>
    preferredWords.some((word) => option.includes(word)),
  );
  return matched ?? hit.benignOptions.join("；");
}

function factTimestamp(fact: HitFact): number {
  const parsed = Date.parse(fact.sourcePublishedAt ?? fact.fetchedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortFacts(facts: HitFact[]): HitFact[] {
  return [...facts].sort((left, right) => factTimestamp(right) - factTimestamp(left));
}

function sumField(facts: HitFact[], field: string): number | null {
  const values = facts
    .map((fact) => numberValue(fact.value[field]))
    .filter((value): value is number => value !== null);
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null;
}

/**
 * 单条信号的正文。所有数字都直接来自结构化字段。
 */
function buildFactText(hit: Hit, fact: HitFact): string {
  const value = fact.value;
  const subtype = stringValue(value.subtype) ?? fact.type;
  const violation = stringValue(value.violation);
  const stage = stringValue(value.stage);
  const stageDate = stringValue(value.stageDate);
  const stagePeriod = stringValue(value.stagePeriod);
  const complaintPeriod = stringValue(value.complaintPeriod);
  const complaintDate = stringValue(value.complaintDate);
  const authority = stringValue(value.authority);
  const paidDate = stringValue(value.paidDate);

  const complaintLead = authority ? `${authority}接到投诉` : "接到投诉";
  const complaintPart = complaintPeriod
    ? `${formatMonth(complaintPeriod)}，${complaintLead}，`
    : complaintDate
      ? `${formatDate(complaintDate)}，${complaintLead}，`
      : "";

  let text = "";

  if (subtype === "wage_arrears" || subtype === "wage_arrears_resolved") {
    const workerCount = numberValue(value.workerCount);
    const amountYuan = numberValue(value.amountYuan);

    if (subtype === "wage_arrears_resolved" && paidDate && workerCount !== null && amountYuan !== null) {
      text = `${complaintPart}该公司拖欠 ${workerCount} 名劳动者劳动报酬 ${formatYuan(
        amountYuan,
      )}，${formatDate(paidDate)}已全部支付。`;
    } else if (workerCount !== null && amountYuan !== null && stage) {
      const stagePart = stageDate
        ? `${formatDate(stageDate)}，`
        : stagePeriod
          ? `${formatMonth(stagePeriod)}，`
          : `${formatPeriod(fact.period)}，`;
      text = `${complaintPart}${stagePart}该公司因拖欠 ${workerCount} 名劳动者劳动报酬 ${formatYuan(
        amountYuan,
      )}，被${stage}。`;
    } else if (violation && stage) {
      text = `${complaintPart}${violation}，被${stage}。`;
    }
  } else if (subtype === "employment_scam") {
    const amountMin = numberValue(value.amountMinYuan);
    const amountMax = numberValue(value.amountMaxYuan);
    const penaltyYuan = numberValue(value.penaltyYuan);
    const violationPeriod = stringValue(value.violationPeriod);

    const bodyParts = [violation ?? "违规向求职者收费"];
    if (stage) bodyParts.push(`被${stage}`);
    let body = bodyParts.join("，");

    if (amountMin !== null && amountMax !== null) {
      body += `；涉及金额 ${formatYuanRange(amountMin, amountMax)}`;
    } else if (penaltyYuan !== null) {
      body += `；罚款 ${formatYuan(penaltyYuan)}`;
    }

    text = `${violationPeriod ? `${violationPeriod}，` : `${formatPeriod(fact.period)}，`}${body}。`;
  } else if (subtype === "social_insurance") {
    const penaltyYuan = numberValue(value.penaltyYuan);
    text = `${formatPeriod(fact.period)}，${violation ?? "未依法办理社会保险登记"}${
      stage ? `，被${stage}` : ""
    }${penaltyYuan !== null ? `，罚款 ${formatYuan(penaltyYuan)}` : ""}。`;
  } else if (fact.type === "court_exec") {
    const count12m = numberValue(value.count12m);
    const amountYuan = numberValue(value.amountYuan);
    if (count12m !== null) {
      text = `${formatPeriod(fact.period)}，该公司有 ${count12m} 条被执行记录${
        amountYuan !== null ? `，涉案金额 ${formatYuan(amountYuan)}` : ""
      }。`;
    }
  } else if (fact.type === "insured_drop") {
    const from = numberValue(value.from);
    const to = numberValue(value.to);
    const ratio = numberValue(value.ratio);
    if (from !== null && to !== null) {
      text = `${formatPeriod(fact.period)}，参保人数从 ${from} 人降至 ${to} 人${
        ratio !== null ? `，降幅 ${formatPercent(ratio)}` : ""
      }。`;
    }
  } else if (fact.type === "hiring_anomaly") {
    const staleMonths = numberValue(value.staleMonths);
    if (staleMonths !== null) {
      text = `该岗位已挂出 ${staleMonths} 个月。`;
    }
  }

  if (!text) {
    text = `${formatPeriod(fact.period)}，公开记录中有一条${hit.ruleName}。`;
  }

  return text;
}

/**
 * 多条信号命中的同一规则时，先给出汇总，再给出最近一条的细节。
 * 这样不会用第一条记录代表全部记录。
 */
function buildAggregateLead(facts: HitFact[], subtype: string): string | null {
  if (facts.length <= 1) return null;

  const type = facts[0]?.type;
  const count = facts.length;

  if (subtype === "wage_arrears" || subtype === "wage_arrears_resolved") {
    const workers = sumField(facts, "workerCount");
    const amount = sumField(facts, "amountYuan");
    const totals: string[] = [];
    if (workers !== null) totals.push(`${workers} 名劳动者`);
    if (amount !== null) totals.push(formatYuan(amount));
    const label =
      subtype === "wage_arrears_resolved" ? "欠薪（已支付）记录" : "欠薪记录";
    return `共 ${count} 条${label}${
      totals.length > 0 ? `，记录中合计涉及 ${totals.join("、")}` : ""
    }。最近一条：`;
  }

  if (subtype === "social_insurance") {
    const penalty = sumField(facts, "penaltyYuan");
    return `共 ${count} 条社保违规记录${
      penalty !== null ? `，罚款合计 ${formatYuan(penalty)}` : ""
    }。最近一条：`;
  }

  if (subtype === "employment_scam") {
    const amountMin = sumField(facts, "amountMinYuan");
    const amountMax = sumField(facts, "amountMaxYuan");
    const penalty = sumField(facts, "penaltyYuan");
    let totals = "";
    if (amountMin !== null && amountMax !== null) {
      totals = `，涉及金额合计 ${formatYuanRange(amountMin, amountMax)}`;
    } else if (penalty !== null) {
      totals = `，罚款合计 ${formatYuan(penalty)}`;
    }
    return `共 ${count} 条违规收费记录${totals}。最近一条：`;
  }

  if (type === "court_exec") {
    const execCount = sumField(facts, "count12m");
    const amount = sumField(facts, "amountYuan");
    const parts = [`共 ${count} 条被执行相关记录`];
    if (execCount !== null) parts.push(`合计 ${execCount} 条被执行信息`);
    if (amount !== null) parts.push(`涉案金额合计 ${formatYuan(amount)}`);
    return `${parts.join("，")}。最近一条：`;
  }

  if (type === "insured_drop") {
    return `共 ${count} 个参保观察期。最近一期：`;
  }

  if (type === "hiring_anomaly") {
    const maxStale = Math.max(
      ...facts.map((fact) => numberValue(fact.value.staleMonths) ?? 0),
    );
    return `共 ${count} 条岗位记录，最长已挂出 ${maxStale} 个月。`;
  }

  return `共 ${count} 条相关公开记录。最近一条：`;
}

function buildPoint(hit: Hit): ReportPoint | null {
  const facts = sortFacts(hit.facts);
  const firstFact = facts[0];
  if (!firstFact) return null;

  const subtype = stringValue(firstFact.value.subtype) ?? firstFact.type;
  const lead = buildAggregateLead(facts, subtype);

  // 岗位异常展示“最长挂出”的那条，而不是最近一条，避免汇总与正文互相矛盾。
  const baseFact =
    firstFact.type === "hiring_anomaly" && facts.length > 1
      ? facts.reduce((best, fact) =>
          (numberValue(fact.value.staleMonths) ?? 0) >
          (numberValue(best.value.staleMonths) ?? 0)
            ? fact
            : best,
        )
      : firstFact;

  const body = buildFactText(hit, baseFact);
  const text =
    firstFact.type === "hiring_anomaly" && lead ? lead : lead ? `${lead}${body}` : body;

  return {
    text,
    ruleId: hit.ruleId,
    signalIds: hit.signalIds,
    severity: hit.severity,
    benign: chooseBenign(hit, subtype),
    action: hit.action,
    questions: hit.questions.slice(0, 3),
  };
}

/**
 * 模板解释层：不调用模型，永远可用。
 * 所有数字直接来自信号字段，不可能编造。
 */
export function buildTemplateReport(
  hits: Hit[],
  dataCutoff: Date | null,
): ReportDraft {
  if (hits.length === 0) {
    return {
      conclusion: "该主体已收录，暂未检索到公开的异常记录，但这不等于没有风险。",
      points: [],
      status: "no_hit",
      modelVersion: TEMPLATE_VERSION,
      dataCutoff,
    };
  }

  const points = hits
    .map(buildPoint)
    .filter((point): point is ReportPoint => point !== null);

  if (points.length === 0) {
    return {
      conclusion: "本次检索到的记录暂时无法整理成结论，请查看原始来源。",
      points: [],
      status: "no_hit",
      modelVersion: TEMPLATE_VERSION,
      dataCutoff,
    };
  }

  const firstRuleName =
    hits.find((hit) => hit.ruleId === points[0].ruleId)?.ruleName ?? "公开记录";
  const totalSignalCount = points.reduce(
    (sum, point) => sum + point.signalIds.length,
    0,
  );

  const conclusion =
    points.length === 1
      ? `这家公司有 ${totalSignalCount} 条公开的${firstRuleName}，建议面试时问清楚。`
      : `本次检索到 ${points.length} 类公开记录，共 ${totalSignalCount} 条，建议逐条核实。`;

  return {
    conclusion,
    points,
    status: "ok",
    modelVersion: "template-v2",
    dataCutoff,
  };
}
