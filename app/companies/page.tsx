import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { recordLabel } from "@/lib/record-label";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "本期档案",
  alternates: { canonical: "/companies" },
};

const PAGE_SIZE = 30;

function pageHref(province: string, page: number): string {
  const search = new URLSearchParams();
  if (province !== "all") search.set("province", province);
  if (page > 1) search.set("page", String(page));
  const query = search.toString();
  return query ? `/companies?${query}` : "/companies";
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ province?: string; page?: string }>;
}) {
  const params = await searchParams;
  const province = (params.province ?? "all").trim() || "all";
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const where = province === "all" ? {} : { province };

  const [totalCompanies, withSignals, filteredTotal, provinceGroups] =
    await Promise.all([
      prisma.company.count(),
      prisma.company.count({ where: { signals: { some: {} } } }),
      prisma.company.count({ where }),
      prisma.company.groupBy({
        by: ["province"],
        where: { province: { not: null } },
        _count: { _all: true },
      }),
    ]);

  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));
  const page = Math.min(
    Math.max(1, Number.isFinite(requestedPage) ? requestedPage : 1),
    totalPages,
  );

  const companies = await prisma.company.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      name: true,
      province: true,
      city: true,
      industry: true,
      _count: { select: { signals: true } },
      signals: {
        select: { type: true, value: true, sourcePublishedAt: true },
        orderBy: { sourcePublishedAt: "desc" },
        take: 1,
      },
    },
  });

  const provinceOptions = provinceGroups
    .filter((row): row is typeof row & { province: string } =>
      Boolean(row.province),
    )
    .sort((left, right) => right._count._all - left._count._all);

  return (
    <div className="mx-auto max-w-4xl pb-16 pt-12">
      <Link
        href="/"
        className="text-xs text-muted underline underline-offset-4 transition hover:text-ink"
      >
        ← 返回搜索
      </Link>

      <header className="mt-7 border-b-2 border-ink pb-6">
        <p className="font-mono text-[10px] tracking-[0.2em] text-accent">
          档案索引 / INDEX
        </p>
        <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight">
          本期档案
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
          本期收录 {totalCompanies} 家企业主体，其中 {withSignals}{" "}
          家已核验到公开风险信号。未命中信号只代表已收录来源里没有相关记录，
          不代表公司有问题，也不代表没有问题；没有记录不等于安全。
        </p>
      </header>

      <form
        action="/companies"
        method="get"
        className="mt-6 flex flex-wrap items-end gap-3"
      >
        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] tracking-wide text-muted">
            省份
          </span>
          <select
            name="province"
            defaultValue={province}
            className="h-11 min-w-[10rem] border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-accent/60"
          >
            <option value="all">全部省份（{totalCompanies}）</option>
            {provinceOptions.map((row) => (
              <option key={row.province} value={row.province}>
                {row.province}（{row._count._all}）
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="inline-flex h-11 items-center border border-ink bg-ink px-5 font-mono text-[11px] tracking-wide text-paper transition hover:bg-ink/90"
        >
          筛选
        </button>
        {province !== "all" ? (
          <Link
            href="/companies"
            className="inline-flex h-11 items-center text-xs text-accent underline underline-offset-4"
          >
            清除筛选
          </Link>
        ) : null}
      </form>

      <p className="mt-5 font-mono text-[10px] text-muted">
        当前筛选 {filteredTotal} 家 · 第 {page} / {totalPages} 页
      </p>

      {companies.length === 0 ? (
        <p className="mt-6 border-y border-line py-12 text-sm text-muted">
          这个筛选下还没有收录企业。未收录不代表没有风险。
        </p>
      ) : (
        <ul className="mt-2 border-t border-line">
          {companies.map((company) => (
            <li key={company.id}>
              <Link
                href={`/company/${company.id}`}
                className="group grid grid-cols-1 gap-2 border-b border-line py-4 transition hover:bg-white/70 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-6"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-mono text-[9px] tracking-[0.16em] text-accent">
                      {recordLabel(company.signals[0])}
                    </span>
                    <span className="font-serif text-base font-medium leading-snug transition group-hover:text-accent">
                      {company.name}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {[company.province, company.city, company.industry]
                      .filter(Boolean)
                      .join(" · ") || "地区与行业待补充"}
                  </p>
                </div>
                <div className="flex items-center gap-4 font-mono text-[10px] text-muted sm:flex-col sm:items-end sm:gap-1">
                  <span>
                    {company.signals[0]?.sourcePublishedAt
                      ? formatDate(company.signals[0].sourcePublishedAt)
                      : "暂无公开日期"}
                  </span>
                  <span>{company._count.signals} 条信号</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 ? (
        <nav
          aria-label="分页"
          className="mt-8 flex items-center justify-between border-t border-line pt-5"
        >
          {page > 1 ? (
            <Link
              href={pageHref(province, page - 1)}
              className="inline-flex h-11 items-center border border-line px-4 text-xs text-ink transition hover:border-ink/40"
            >
              ← 上一页
            </Link>
          ) : (
            <span className="inline-flex h-11 items-center border border-line/60 px-4 text-xs text-muted/60">
              ← 上一页
            </span>
          )}
          <span className="font-mono text-[10px] text-muted">
            {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={pageHref(province, page + 1)}
              className="inline-flex h-11 items-center border border-line px-4 text-xs text-ink transition hover:border-ink/40"
            >
              下一页 →
            </Link>
          ) : (
            <span className="inline-flex h-11 items-center border border-line/60 px-4 text-xs text-muted/60">
              下一页 →
            </span>
          )}
        </nav>
      ) : null}
    </div>
  );
}
