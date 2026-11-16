export const SOURCE_HEALTH_STATUSES = [
  "blocked",
  "unreachable",
  "changed",
  "unknown",
  "ok",
] as const;

export type SourceHealthStatus = (typeof SOURCE_HEALTH_STATUSES)[number];

export const SOURCE_HEALTH_LABELS: Record<string, string> = {
  ok: "正常",
  changed: "内容有变化",
  blocked: "拒绝访问",
  unreachable: "无法访问",
  unknown: "待检查",
};

export const SOURCE_CATEGORY_LABELS: Record<string, string> = {
  labor_violation: "劳动用工",
  court_exec: "被执行",
  credit_penalty: "行政处罚",
  tax_arrears: "欠税",
  bankruptcy: "破产重整",
  operating_anomaly: "经营异常",
  other: "其他",
};

export function sourceCategoryLabel(value: string): string {
  return SOURCE_CATEGORY_LABELS[value] ?? value;
}

export function sourceHealthLabel(value: string): string {
  return SOURCE_HEALTH_LABELS[value] ?? value;
}

export function sourceHealthClass(value: string): string {
  switch (value) {
    case "ok":
      return "border-ink/20 bg-ink/5 text-muted";
    case "changed":
      return "border-accent/40 bg-accent-soft text-accent";
    case "blocked":
      return "border-ink bg-ink text-paper";
    case "unreachable":
      return "border-accent bg-accent text-paper";
    case "unknown":
    default:
      return "border-line bg-white text-muted";
  }
}

export function sourceHealthRank(value: string): number {
  const index = (SOURCE_HEALTH_STATUSES as readonly string[]).indexOf(value);
  return index === -1 ? SOURCE_HEALTH_STATUSES.length : index;
}
