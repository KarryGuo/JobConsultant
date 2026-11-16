const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 不同信号类型的默认复核周期。
 * 招聘挂出状态变化快，周期短；参保人数按年度披露，周期长。
 */
export const DEFAULT_REVIEW_CYCLE_DAYS: Record<string, number> = {
  hiring_anomaly: 14,
  court_exec: 30,
  labor_violation: 30,
  insured_drop: 90,
};

export const FALLBACK_REVIEW_CYCLE_DAYS = 30;

export function defaultReviewCycleDays(type: string): number {
  return DEFAULT_REVIEW_CYCLE_DAYS[type] ?? FALLBACK_REVIEW_CYCLE_DAYS;
}

export function computeNextReviewAt(
  lastVerifiedAt: Date,
  reviewCycleDays: number,
): Date {
  return new Date(lastVerifiedAt.getTime() + reviewCycleDays * DAY_MS);
}

export function isStale(
  nextReviewAt: Date | null | undefined,
  now = new Date(),
): boolean {
  return Boolean(nextReviewAt && nextReviewAt.getTime() <= now.getTime());
}

export function latestVerificationAt(
  signals: Array<{ lastVerifiedAt: Date | null }>,
): Date | null {
  return signals.reduce<Date | null>(
    (latest, signal) =>
      signal.lastVerifiedAt &&
      (!latest || signal.lastVerifiedAt.getTime() > latest.getTime())
        ? signal.lastVerifiedAt
        : latest,
    null,
  );
}

export function staleSignals<T extends { nextReviewAt: Date | null }>(
  signals: T[],
  now = new Date(),
): T[] {
  return signals.filter((signal) => isStale(signal.nextReviewAt, now));
}
