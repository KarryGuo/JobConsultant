export const APPEAL_STATUSES = [
  "open",
  "reviewing",
  "resolved",
  "rejected",
] as const;

export type AppealStatus = (typeof APPEAL_STATUSES)[number];

export const APPEAL_STATUS_LABELS: Record<AppealStatus, string> = {
  open: "待处理",
  reviewing: "处理中",
  resolved: "已更正",
  rejected: "已拒绝",
};

export const APPEAL_CATEGORY_LABELS: Record<string, string> = {
  fact_error: "事实错误",
  outdated: "记录已过时",
  missing_context: "缺少背景",
  wrong_company: "主体认错",
  other: "其他",
};

export const APPEAL_EVENT_LABELS: Record<string, string> = {
  created: "提交申诉",
  status_changed: "状态变更",
  note_updated: "更新备注",
  status_and_note_changed: "状态与备注变更",
  correction_applied: "更正已应用",
};

export function isAppealStatus(
  value: string | undefined,
): value is AppealStatus {
  return Boolean(
    value && (APPEAL_STATUSES as readonly string[]).includes(value),
  );
}

export function appealStatusLabel(value: string): string {
  return isAppealStatus(value) ? APPEAL_STATUS_LABELS[value] : value;
}

export function appealCategoryLabel(value: string): string {
  return APPEAL_CATEGORY_LABELS[value] ?? value;
}

export function appealEventLabel(value: string): string {
  return APPEAL_EVENT_LABELS[value] ?? value;
}

export function appealStatusClass(value: string): string {
  switch (value) {
    case "open":
      return "border-accent/40 bg-accent-soft text-accent";
    case "reviewing":
      return "border-ink bg-ink text-paper";
    case "resolved":
      return "border-ink/20 bg-ink/5 text-muted";
    case "rejected":
      return "border-line bg-white text-muted";
    default:
      return "border-line bg-white text-muted";
  }
}
