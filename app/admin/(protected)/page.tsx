import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import {
  APPEAL_STATUSES,
  APPEAL_STATUS_LABELS,
  appealCategoryLabel,
  appealStatusClass,
  appealStatusLabel,
  isAppealStatus,
} from "@/lib/appeal";

export const metadata = {
  title: "申诉处理",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

function filterHref(status: string, page = 1): string {
  const search = new URLSearchParams();
  if (status !== "all") search.set("status", status);
  if (page > 1) search.set("page", String(page));
  const query = search.toString();
  return query ? `/admin?${query}` : "/admin";
}

function excerpt(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 80);
}

export default async function AdminAppealsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const params = await searchParams;
  const status = isAppealStatus(params.status) ? params.status : "all";
  const requestedPage = Math.max(1, Number(params.page ?? "1") || 1);
  const where = status === "all" ? {} : { status };

  const [groups, total] = await Promise.all([
    prisma.appealRequest.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.appealRequest.count({ where }),
  ]);

  const totalAll = groups.reduce((sum, group) => sum + group._count._all, 0);
  const countByStatus = new Map(
    groups.map((group) => [group.status, group._count._all]),
  );
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  const appeals = await prisma.appealRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const filters = [
    { value: "all", label: "全部", count: totalAll },
    ...APPEAL_STATUSES.map((value) => ({
      value,
      label: APPEAL_STATUS_LABELS[value],
      count: countByStatus.get(value) ?? 0,
    })),
  ];

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-5">
        <div>
          <p className="font-mono text-[10px] tracking-[0.2em] text-accent">
            申诉队列 / APPEALS
          </p>
          <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight">
            申诉处理
          </h1>
          <p className="mt-2 text-sm text-muted">
            共 {totalAll} 条申诉，仅内部可见。
          </p>
        </div>
        <Link
          href="/appeal"
          target="_blank"
          rel="noreferrer noopener"
          className="text-xs text-accent underline underline-offset-4"
        >
          打开前台申诉页 ↗
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {filters.map((filter) => (
          <Link
            key={filter.value}
            href={filterHref(filter.value)}
            className={`inline-flex h-8 items-center border px-3 font-mono text-[10px] tracking-wide transition ${
              status === filter.value
                ? "border-ink bg-ink text-paper"
                : "border-line bg-white text-muted hover:border-ink/30"
            }`}
          >
            {filter.label}
            <span
              className={`ml-2 ${
                status === filter.value ? "text-paper/60" : "text-muted/70"
              }`}
            >
              {filter.count}
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-7">
        <div className="hidden grid-cols-[84px_1fr_140px_100px_30px] border-b border-line pb-2 font-mono text-[9px] tracking-wide text-muted sm:grid">
          <span>状态</span>
          <span>公司 / 问题</span>
          <span>联系方式</span>
          <span>收到时间</span>
          <span />
        </div>

        {appeals.length === 0 ? (
          <p className="border-b border-line py-12 text-sm text-muted">
            这个筛选下还没有申诉。
          </p>
        ) : (
          <div className="border-b border-line">
            {appeals.map((appeal) => (
              <Link
                key={appeal.id}
                href={`/admin/appeals/${appeal.id}`}
                className="grid gap-2 border-t border-line py-4 transition hover:bg-white/60 sm:grid-cols-[84px_1fr_140px_100px_30px] sm:items-center"
              >
                <span
                  className={`inline-flex w-fit border px-2 py-0.5 font-mono text-[9px] tracking-wide ${appealStatusClass(
                    appeal.status,
                  )}`}
                >
                  {appealStatusLabel(appeal.status)}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-serif text-base font-medium">
                    {appeal.companyName}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-muted">
                    {appealCategoryLabel(appeal.category)} ·{" "}
                    {excerpt(appeal.details)}
                  </p>
                </div>
                <span className="truncate font-mono text-[10px] text-muted">
                  {appeal.contact}
                </span>
                <span className="font-mono text-[10px] text-muted">
                  {formatDate(appeal.createdAt)}
                </span>
                <span className="hidden text-right text-muted sm:inline">
                  →
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {totalPages > 1 ? (
        <div className="mt-6 flex items-center justify-between text-xs text-muted">
          <span>
            第 {page} / {totalPages} 页
          </span>
          <div className="flex gap-4">
            {page > 1 ? (
              <Link
                href={filterHref(status, page - 1)}
                className="underline underline-offset-4 transition hover:text-ink"
              >
                上一页
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link
                href={filterHref(status, page + 1)}
                className="underline underline-offset-4 transition hover:text-ink"
              >
                下一页
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
