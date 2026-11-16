import Link from "next/link";
import { AdminSourceCheckButton } from "@/components/admin-source-check-button";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import {
  SOURCE_HEALTH_LABELS,
  SOURCE_HEALTH_STATUSES,
  sourceCategoryLabel,
  sourceHealthClass,
  sourceHealthLabel,
  sourceHealthRank,
} from "@/lib/source-health";

export const metadata = {
  title: "来源健康",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminSourcesPage() {
  const sources = await prisma.sourceHealth.findMany({
    orderBy: { sourceUrl: "asc" },
  });

  const registry = (
    await prisma.sourceRegistry.findMany({ orderBy: { name: "asc" } })
  ).sort(
    (left, right) =>
      Number(right.enabled) - Number(left.enabled) ||
      left.category.localeCompare(right.category),
  );

  const enabledSources = registry.filter((source) => source.enabled).length;

  const sorted = [...sources].sort((left, right) => {
    const rank =
      sourceHealthRank(left.status) - sourceHealthRank(right.status);
    if (rank !== 0) return rank;
    return (
      (left.lastCheckedAt?.getTime() ?? 0) -
      (right.lastCheckedAt?.getTime() ?? 0)
    );
  });

  const counts = new Map<string, number>();
  for (const source of sources) {
    counts.set(source.status, (counts.get(source.status) ?? 0) + 1);
  }

  const attention = sources.filter(
    (source) => source.status !== "ok" && source.status !== "unknown",
  ).length;

  return (
    <section>
      <div className="border-b border-line pb-5">
        <p className="font-mono text-[10px] tracking-[0.2em] text-accent">
          来源健康 / SOURCES
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight">
          来源健康
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          由 <code className="font-mono text-xs">pnpm check:sources</code>{" "}
          定时检查。内容有变化时会保留基线指纹，人工复核后再运行{" "}
          <code className="font-mono text-xs">--accept-changes</code>{" "}
          接受新内容。当前有 {attention} 个来源需要处理。
        </p>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {SOURCE_HEALTH_STATUSES.map((status) => (
          <span
            key={status}
            className={`inline-flex h-8 items-center border px-3 font-mono text-[10px] tracking-wide ${sourceHealthClass(
              status,
            )}`}
          >
            {SOURCE_HEALTH_LABELS[status]}
            <span className="ml-2 opacity-60">{counts.get(status) ?? 0}</span>
          </span>
        ))}
      </div>

      <div className="mt-7">
        <div className="hidden grid-cols-[86px_1fr_150px_72px_110px] border-b border-line pb-2 font-mono text-[9px] tracking-wide text-muted sm:grid">
          <span>状态</span>
          <span>来源</span>
          <span>最后检查</span>
          <span className="text-right">连续失败</span>
          <span className="text-right">操作</span>
        </div>

        {sorted.length === 0 ? (
          <p className="border-b border-line py-12 text-sm text-muted">
            还没有来源记录。先运行一次数据导入，或执行{" "}
            <code className="font-mono text-xs">pnpm check:sources</code>。
          </p>
        ) : (
          <div className="border-b border-line">
            {sorted.map((source) => (
              <div
                key={source.id}
                className="grid gap-2 border-t border-line py-4 sm:grid-cols-[86px_1fr_150px_72px_110px] sm:items-center"
              >
                <span
                  className={`inline-flex w-fit border px-2 py-0.5 font-mono text-[9px] tracking-wide ${sourceHealthClass(
                    source.status,
                  )}`}
                >
                  {sourceHealthLabel(source.status)}
                </span>

                <div className="min-w-0">
                  <p className="truncate font-serif text-base font-medium">
                    {source.sourceTitle}
                  </p>
                  <a
                    href={source.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-1 block truncate font-mono text-[10px] text-muted underline underline-offset-4 transition hover:text-accent"
                  >
                    {source.sourceUrl}
                  </a>
                  {source.status === "changed" ? (
                    <p className="mt-1 font-mono text-[10px] text-accent">
                      最近内容与基线指纹不一致，需要人工复核。
                    </p>
                  ) : source.lastError ? (
                    <p className="mt-1 font-mono text-[10px] text-muted">
                      {source.lastError}
                    </p>
                  ) : null}
                </div>

                <div className="font-mono text-[10px] leading-5 text-muted">
                  <p>{formatDateTime(source.lastCheckedAt)}</p>
                  {source.lastStatusCode ? (
                    <p>HTTP {source.lastStatusCode}</p>
                  ) : null}
                </div>

                <p className="font-mono text-[10px] text-muted sm:text-right">
                  {source.consecutiveFailures}
                </p>

                <AdminSourceCheckButton sourceId={source.id} />
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="mt-6 text-xs leading-6 text-muted">
        检查脚本返回非零退出码表示存在内容变化或访问失败，可直接接入定时任务告警。
        来源恢复后会保留历史错误直到下一次成功检查。
      </p>

      <div className="mt-10 border-t-2 border-ink pt-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] tracking-[0.2em] text-accent">
              来源注册表 / REGISTRY
            </p>
            <h2 className="mt-1 font-serif text-xl font-semibold">
              来源注册表
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
              已启用 {enabledSources} 个，规划中{" "}
              {registry.length - enabledSources} 个。新公告通过 key
              关联，决定信号分类与默认复核周期。
            </p>
          </div>
          <code className="font-mono text-[10px] text-muted">
            pnpm seed:sources
          </code>
        </div>

        {registry.length === 0 ? (
          <p className="mt-5 border-y border-line py-8 text-sm text-muted">
            注册表为空。运行{" "}
            <code className="font-mono text-xs">pnpm seed:sources</code>{" "}
            初始化来源。
          </p>
        ) : (
          <div className="mt-5">
            <div className="hidden grid-cols-[70px_1fr_120px_90px_120px] border-b border-line pb-2 font-mono text-[9px] tracking-wide text-muted sm:grid">
              <span>状态</span>
              <span>来源</span>
              <span>分类 / 等级</span>
              <span>地区</span>
              <span>最近导入</span>
            </div>
            <div className="border-b border-line">
              {registry.map((source) => (
                <div
                  key={source.id}
                  className="grid gap-2 border-t border-line py-4 sm:grid-cols-[70px_1fr_120px_90px_120px] sm:items-center"
                >
                  <span
                    className={`inline-flex w-fit border px-2 py-0.5 font-mono text-[9px] tracking-wide ${
                      source.enabled
                        ? "border-ink bg-ink text-paper"
                        : "border-line bg-white text-muted"
                    }`}
                  >
                    {source.enabled ? "启用" : "规划中"}
                  </span>

                  <div className="min-w-0">
                    <p className="truncate font-serif text-base font-medium">
                      {source.name}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[10px] text-muted">
                      {source.key}
                    </p>
                    {source.baseUrl ? (
                      <a
                        href={source.baseUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-0.5 block truncate font-mono text-[10px] text-accent underline underline-offset-4"
                      >
                        {source.baseUrl}
                      </a>
                    ) : null}
                    {source.notes ? (
                      <p className="mt-1 text-[11px] leading-5 text-muted">
                        {source.notes}
                      </p>
                    ) : null}
                  </div>

                  <div className="font-mono text-[10px] leading-5 text-muted">
                    <p>{sourceCategoryLabel(source.category)}</p>
                    <p>等级 {source.level}</p>
                  </div>

                  <span className="font-mono text-[10px] text-muted">
                    {source.region ?? "全国"}
                  </span>

                  <span className="font-mono text-[10px] text-muted">
                    {source.lastImportedAt
                      ? formatDateTime(source.lastImportedAt)
                      : "尚未导入"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <Link
        href="/admin"
        className="mt-6 inline-flex text-xs text-muted underline underline-offset-4 transition hover:text-ink"
      >
        ← 返回申诉队列
      </Link>
    </section>
  );
}
