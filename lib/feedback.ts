export const FEEDBACK_MIN_SAMPLE = 5;

export const ROUNDS_OPTIONS = [
  { value: "1-3", label: "1–3 轮" },
  { value: "4-6", label: "4–6 轮" },
  { value: "7+", label: "7 轮以上" },
] as const;

export const DAYS_OPTIONS = [
  { value: "within_1_week", label: "1 周内" },
  { value: "2_4_weeks", label: "2–4 周" },
  { value: "1_2_months", label: "1–2 个月" },
  { value: "longer", label: "更久" },
  { value: "no_result", label: "没有结果" },
] as const;

export const PRIVACY_OPTIONS = [
  { value: "yes", label: "被问过" },
  { value: "no", label: "没有被问" },
  { value: "decline", label: "不方便回答" },
] as const;

export const TEST_TASK_OPTIONS = [
  { value: "none", label: "没有笔试/作业" },
  { value: "within_2h", label: "有，2 小时内" },
  { value: "over_2h", label: "有，超过 2 小时" },
] as const;

export const REJECTION_OPTIONS = [
  { value: "with_reason", label: "收到，且说明原因" },
  { value: "without_reason", label: "收到，但没有原因" },
  { value: "none", label: "没有收到" },
] as const;

export type FeedbackSample = {
  roundsBand: string | null;
  daysToResultBand: string | null;
  askedPrivacy: string | null;
  testTaskBand: string | null;
  rejectionBand: string | null;
};

export type FeedbackStats = {
  total: number;
  roundsMode: { label: string; count: number } | null;
  daysMode: { label: string; count: number } | null;
  privacyRate: number | null;
  privacySample: number;
  rejectionRate: number | null;
  rejectionSample: number;
};

function modeOf(
  values: Array<string | null>,
  options: ReadonlyArray<{ value: string; label: string }>,
): { label: string; count: number } | null {
  const counts = new Map<string, number>();

  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  if (counts.size === 0) return null;

  const [value, count] = Array.from(counts.entries()).sort(
    (left, right) => right[1] - left[1],
  )[0];
  const label = options.find((option) => option.value === value)?.label ?? value;

  return { label, count };
}

/**
 * 面试反馈全部是区间选项，聚合时展示“最常见区间”，
 * 不把区间伪造成精确平均数。
 */
export function summarizeFeedback(feedbacks: FeedbackSample[]): FeedbackStats {
  const privacyAnswers = feedbacks
    .map((feedback) => feedback.askedPrivacy)
    .filter((value): value is "yes" | "no" => value === "yes" || value === "no");
  const privacyYes = privacyAnswers.filter((value) => value === "yes").length;

  const rejectionAnswers = feedbacks
    .map((feedback) => feedback.rejectionBand)
    .filter(
      (value): value is "with_reason" | "without_reason" | "none" =>
        value === "with_reason" || value === "without_reason" || value === "none",
    );
  const rejectionReceived = rejectionAnswers.filter(
    (value) => value !== "none",
  ).length;

  return {
    total: feedbacks.length,
    roundsMode: modeOf(
      feedbacks.map((feedback) => feedback.roundsBand),
      ROUNDS_OPTIONS,
    ),
    daysMode: modeOf(
      feedbacks.map((feedback) => feedback.daysToResultBand),
      DAYS_OPTIONS,
    ),
    privacyRate:
      privacyAnswers.length > 0 ? privacyYes / privacyAnswers.length : null,
    privacySample: privacyAnswers.length,
    rejectionRate:
      rejectionAnswers.length > 0
        ? rejectionReceived / rejectionAnswers.length
        : null,
    rejectionSample: rejectionAnswers.length,
  };
}
