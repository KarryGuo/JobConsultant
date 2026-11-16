import Link from "next/link";
import { AdminReviewSignalButton } from "@/components/admin-review-signal-button";
import { prisma } from "@/lib/db";
import { formatDate, formatDateTime, formatPeriod } from "@/lib/format";
import { recordLabel } from "@/lib/record-label";

export const metadata = {
  title: "复核队列",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminReviewsPage() {
  const now = new Date();
  const signals = await prisma.signal.findMany({
    where: {
      invalidatedAt: null,
      nextReviewAt: { lte: now },
    },
    orderBy: { nextReviewAt: "asc" },
    take: 100,
    include: {
      company: { select: { id: true, name: true } },
    },
  });

  return (
    <section>
      <div className="border-b border-line pb-5">
        <p className="font-mono text-[10px] tracking-[0.2em] text-accent">
          复核队列 / REVIEWS
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight">
          复核队列
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          由信号复核周期自动生成，当前有 {signals.length}{" "}
          条记录已到期。标记已复核会把最近核验时间更新为现在，并顺延一个复核周期。
        </p>
      </div>

      {signals.length === 0 ? (
        <p className="border-b border-line py-12 text-sm text-muted">
          当前没有过期信号。
        </p>
      ) : (
        <div className="mt-7">
          <div className="hidden grid-cols-[1fr_120px_130px_130px_110px] border-b border-line pb-2 font-mono text-[9px] tracking-wide text-muted lg:grid">
            <span>企业 / 记录</span>
            <span>所属期</span>
            <span>最后核验</span>
            <span>下次复核</span>
            <span className="text-right">操作</span>
          </div>

          <div className="border-b border-line">
            {signals.map((signal) => {
              const overdueDays = signal.nextReviewAt
                ? Math.max(
                    0,
                    Math.floor(
                      (now.getTime() - signal.nextReviewAt.getTime()) /
                        (24 * 60 * 60 * 1000),
                    ),
                  )
                : 0;

              return (
                <div
                  key={signal.id}
                  className="grid gap-2 border-t border-line py-4 lg:grid-cols-[1fr_120px_130px_130px_110px] lg:items-center"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/company/${signal.company.id}`}
                      className="truncate font-serif text-base font-medium transition hover:text-accent"
                    >
                      {signal.company.name}
                    </Link>
                    <p className="mt-0.5 truncate text-[11px] text-muted">
                      {recordLabel(signal)} ·{" "}
                      {signal.sourceTitle}
                    </p>
                  </div>

                  <span className="font-mono text-[10px] text-muted">
                    {formatPeriod(signal.period)}
                  </span>

                  <div className="font-mono text-[10px] leading-5 text-muted">
                    <p>{formatDate(signal.lastVerifiedAt)}</p>
                    <p className="text-accent">逾期 {overdueDays} 天</p>
                  </div>

                  <span className="font-mono text-[10px] text-muted">
                    {formatDateTime(signal.nextReviewAt)}
                  </span>

                  <AdminReviewSignalButton signalId={signal.id} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="mt-6 text-xs leading-6 text-muted">
        复核完成后，建议同时到{" "}
        <Link
          href="/admin/sources"
          className="text-accent underline underline-offset-4"
        >
          来源健康
        </Link>{" "}
        运行一次来源检查，确认原始页面仍然可访问、内容没有变化。
      </p>

      <Link
        href="/admin"
        className="mt-6 inline-flex text-xs text-muted underline underline-offset-4 transition hover:text-ink"
      >
        ← 返回申诉队列
      </Link>
    </section>
  );
}
