import Link from "next/link";
import { FEEDBACK_MIN_SAMPLE, type FeedbackStats } from "@/lib/feedback";

export function FeedbackSummary({
  companyId,
  stats,
}: {
  companyId: string;
  stats: FeedbackStats;
}) {
  if (stats.total < FEEDBACK_MIN_SAMPLE) {
    return (
      <section className="mt-10 border-t border-line pt-6">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="font-serif text-lg font-semibold">面试反馈</h2>
          <span className="font-mono text-xs text-muted">
            {stats.total}/{FEEDBACK_MIN_SAMPLE}
          </span>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted">
          样本不足，暂不展示聚合数据。我们不会用 1–2 条反馈代表一家公司。
        </p>
        <div className="mt-3 h-0.5 w-full overflow-hidden bg-line">
          <div
            className="h-full bg-accent"
            style={{
              width: `${Math.min(100, (stats.total / FEEDBACK_MIN_SAMPLE) * 100)}%`,
            }}
          />
        </div>
        <Link
          href={`/feedback/${companyId}`}
          className="mt-4 inline-flex text-sm text-accent underline underline-offset-4"
        >
          提交你的面试反馈 →
        </Link>
      </section>
    );
  }

  return (
    <section className="mt-10 border-t border-line pt-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-serif text-lg font-semibold">面试反馈</h2>
        <span className="font-mono text-xs text-muted">样本 {stats.total} 份</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
        <div>
          <p className="text-[10px] text-muted">面试轮次</p>
          <p className="mt-1 font-serif text-xl font-medium">
            {stats.roundsMode?.label ?? "—"}
          </p>
          {stats.roundsMode ? (
            <p className="mt-0.5 text-[10px] text-muted">
              最常见 · {stats.roundsMode.count} 份
            </p>
          ) : null}
        </div>
        <div>
          <p className="text-[10px] text-muted">出结果时间</p>
          <p className="mt-1 font-serif text-xl font-medium">
            {stats.daysMode?.label ?? "—"}
          </p>
          {stats.daysMode ? (
            <p className="mt-0.5 text-[10px] text-muted">
              最常见 · {stats.daysMode.count} 份
            </p>
          ) : null}
        </div>
        <div>
          <p className="text-[10px] text-muted">被问私人问题</p>
          <p className="mt-1 font-serif text-xl font-medium">
            {stats.privacyRate !== null
              ? `${Math.round(stats.privacyRate * 100)}%`
              : "—"}
          </p>
          <p className="mt-0.5 text-[10px] text-muted">
            有效回答 {stats.privacySample} 份
          </p>
        </div>
        <div>
          <p className="text-[10px] text-muted">收到拒信</p>
          <p className="mt-1 font-serif text-xl font-medium">
            {stats.rejectionRate !== null
              ? `${Math.round(stats.rejectionRate * 100)}%`
              : "—"}
          </p>
          <p className="mt-0.5 text-[10px] text-muted">
            有效回答 {stats.rejectionSample} 份
          </p>
        </div>
      </div>

      <p className="mt-4 text-[11px] leading-5 text-muted">
        全部为区间选项，展示最常见区间与比例，不做个体展示，也不伪造精确平均数。
      </p>
      <Link
        href={`/feedback/${companyId}`}
        className="mt-3 inline-flex text-sm text-accent underline underline-offset-4"
      >
        也提交一份 →
      </Link>
    </section>
  );
}
