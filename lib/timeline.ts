import { formatNumber, formatYuan } from "./format";
import type { SignalLike } from "./types";

export type TimelineEvent = {
  date: Date;
  dateLabel?: string;
  label: string;
  detail: string;
  attention: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildAmountDetail(value: Record<string, unknown>): string {
  const workerCount = asNumber(value.workerCount);
  const amountYuan = asNumber(value.amountYuan);
  const amountMin = asNumber(value.amountMinYuan);
  const amountMax = asNumber(value.amountMaxYuan);
  const penaltyYuan = asNumber(value.penaltyYuan);
  const parts: string[] = [];

  if (workerCount !== null) parts.push(`${workerCount} 名劳动者`);
  if (amountYuan !== null) {
    parts.push(formatYuan(amountYuan));
  } else if (amountMin !== null && amountMax !== null) {
    parts.push(
      `${formatNumber(amountMin / 10000)}–${formatNumber(amountMax / 10000)} 万元`,
    );
  }
  if (penaltyYuan !== null) parts.push(`罚款 ${formatYuan(penaltyYuan)}`);

  return parts.join(" · ");
}

function complaintLabel(subtype: string): string {
  if (subtype === "social_insurance") return "反映社保问题";
  if (subtype === "employment_scam") return "求职者投诉";
  return "接到欠薪投诉";
}

function stageLabelFor(
  subtype: string,
  explicitLabel: string | null,
  stage: string | null,
): string {
  if (explicitLabel) return explicitLabel;
  if (stage) return stage;
  if (subtype === "social_insurance") return "社保违规被处罚";
  if (subtype === "employment_scam") return "违规收费被查处";
  return "处理进展";
}

export function buildTimeline(
  company: { establishedAt: Date | null },
  signals: SignalLike[],
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  if (company.establishedAt) {
    events.push({
      date: company.establishedAt,
      label: "公司成立",
      detail: "工商登记信息",
      attention: false,
    });
  }

  for (const signal of signals) {
    const value = asRecord(signal.value);

    if (signal.type === "labor_violation") {
      const subtype = asString(value.subtype) ?? "wage_arrears";
      const complaintPeriod = asString(value.complaintPeriod);
      const complaintDate = asString(value.complaintDate);
      const stage = asString(value.stage);
      const stageDate = asString(value.stageDate) ?? asString(value.referralDate);
      const stagePeriod = asString(value.stagePeriod);
      const paidDate = asString(value.paidDate);
      const stageLabel = asString(value.stageLabel);
      const violation = asString(value.violation);
      const amountDetail = buildAmountDetail(value);

      if (complaintPeriod || complaintDate) {
        events.push({
          date: new Date(
            complaintPeriod ? `${complaintPeriod}-01` : (complaintDate as string),
          ),
          dateLabel: complaintPeriod ? formatMonthLabel(complaintPeriod) : undefined,
          label: complaintLabel(subtype),
          detail:
            amountDetail ||
            (subtype === "social_insurance" ? "未缴纳社会保险" : violation) ||
            "劳动保障监察立案",
          attention: true,
        });
      }

      if (subtype === "wage_arrears_resolved" && paidDate) {
        events.push({
          date: new Date(paidDate),
          label: "欠薪已全部支付",
          detail: amountDetail || violation || "",
          attention: false,
        });
      } else if (stageDate || stagePeriod) {
        events.push({
          date: new Date(
            stageDate ? stageDate : `${stagePeriod as string}-01`,
          ),
          dateLabel:
            !stageDate && stagePeriod ? formatMonthLabel(stagePeriod) : undefined,
          label: stageLabelFor(subtype, stageLabel, stage),
          detail: [amountDetail, violation].filter(Boolean).join(" · "),
          attention: true,
        });
      }
    } else if (signal.type === "insured_drop") {
      const from = asNumber(value.from);
      const to = asNumber(value.to);
      if (from !== null && to !== null) {
        events.push({
          date: signal.sourcePublishedAt ?? signal.fetchedAt,
          label: "参保人数变化",
          detail: `从 ${from} 人降至 ${to} 人`,
          attention: true,
        });
      }
    } else if (signal.type === "court_exec") {
      const count = asNumber(value.count12m);
      events.push({
        date: signal.sourcePublishedAt ?? signal.fetchedAt,
        label: "被执行记录",
        detail: count !== null ? `近 12 个月 ${count} 条` : "公开执行信息",
        attention: true,
      });
    } else if (signal.type === "hiring_anomaly") {
      const staleMonths = asNumber(value.staleMonths);
      events.push({
        date: signal.sourcePublishedAt ?? signal.fetchedAt,
        label: "岗位挂出异常",
        detail: staleMonths !== null ? `已挂出 ${staleMonths} 个月` : "招聘信息长期未更新",
        attention: false,
      });
    }

    if (signal.sourcePublishedAt) {
      events.push({
        date: signal.sourcePublishedAt,
        label: "官方来源公布",
        detail: signal.sourceTitle,
        attention: false,
      });
    }
  }

  const unique = new Map<string, TimelineEvent>();
  for (const event of events) {
    const key = `${event.date.toISOString().slice(0, 10)}|${event.label}`;
    if (!unique.has(key)) unique.set(key, event);
  }

  return Array.from(unique.values())
    .sort((left, right) => left.date.getTime() - right.date.getTime())
    .slice(-5);
}

function formatMonthLabel(value: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  return match ? `${match[1]}年${Number(match[2])}月` : value;
}
