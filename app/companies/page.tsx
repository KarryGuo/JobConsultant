import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { recordLabel } from "@/lib/record-label";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "本期档案",
  alternates: { canonical: "/companies" },
};

type Filters = {
  province: string;
  city: string;
  industry: string;
};

function filterHref(current: Filters, next: Partial<Filters>): string {
  const values = { ...current, ...next };
  const search = new URLSearchParams();
  if (values.province !== "all") search.set("province", values.province);
  if (values.city !== "all") search.set("city", values.city);
  if (values.industry !== "all") search.set("industry", values.industry);
  const query = search.toString();
  return query ? `/companies?${query}` : "/companies";
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{
    province?: string;
    city?: string;
    industry?: string;
  }>;
}) {
  const params = await searchParams;
  const filters: Filters = {
    province: (params.province ?? "all").trim() || "all",
    city: (params.city ?? "all").trim() || "all",
    industry: (params.industry ?? "all").trim() || "all",
  };

  const allCompanies = await prisma.company.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      province: true,
      city: true,
      industry: true,
      depth: true,
      _count: { select: { signals: true } },
      signals: {
        select: { type: true, value: true, sourcePublishedAt: true },
        orderBy: { sourcePublishedAt: "desc" },
        take: 1,
      },
    },
  });

  const withSignals = allCompanies.filter(
    (company) => company._count.signals > 0,
  ).length;

  const provinceCounts = new Map<string, number>();
  const cityCounts = new Map<string, number>();
  const industryCounts = new Map<string, number>();

  for (const company of allCompanies) {
    if (company.province) {
      provinceCounts.set(
        company.province,
        (provinceCounts.get(company.province) ?? 0) + 1,
      );
    }
    if (company.city) {
      cityCounts.set(company.city, (cityCounts.get(company.city) ?? 0) + 1);
    }
    if (company.industry) {
      industryCounts.set(
        company.industry,
        (industryCounts.get(company.industry) ?? 0) + 1,
      );
    }
  }

  const provinceOptions = Array.from(provinceCounts.entries()).sort(
    (left, right) => right[1] - left[1],
  );
  const cityOptions = Array.from(cityCounts.entries())
    .filter(([city]) => {
      if (filters.province === "all") return true;
      return allCompanies.some(
        (company) =>
          company.city === city && company.province === filters.province,
      );
    })
    .sort((left, right) => right[1] - left[1]);
  const industryOptions = Array.from(industryCounts.entries()).sort(
    (left, right) => right[1] - left[1],
  );

  const companies = allCompanies.filter((company) => {
    if (filters.province !== "all" && company.province !== filters.province) {
      return false;
    }
    if (filters.city !== "all" && company.city !== filters.city) {
      return false;
    }
    if (filters.industry !== "all" && company.industry !== filters.industry) {
      return false;
    }
    return true;
  });

  const hasFilter =
    filters.province !== "all" ||
    filters.city !== "all" ||
    filters.industry !== "all";

  const groups = new Map<
    string,
    {
      province: string;
      total: number;
      cities: Map<string, typeof companies>;
    }
  >();

  for (const company of companies) {
    const province = company.province ?? "地区待补充";
    const city = company.city ?? "城市待补充";
    const group = groups.get(province) ?? {
      province,
      total: 0,
      cities: new Map<string, typeof companies>(),
    };
    group.total += 1;
    const cityRows = group.cities.get(city) ?? [];
    cityRows.push(company);
    group.cities.set(city, cityRows);
    groups.set(province, group);
  }

  const orderedGroups = Array.from(groups.values()).sort(
    (left, right) =>
      right.total - left.total ||
      left.province.localeCompare(right.province, "zh-CN"),
  );

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
          本期收录 {allCompanies.length} 家企业主体，其中 {withSignals}{" "}
          家已核验到公开风险信号。未命中信号只代表已收录来源里没有相关记录，
          不代表公司有问题，也不代表没有问题；没有记录不等于安全。
        </p>
      </header>

      <div className="mt-6 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 font-mono text-[9px] tracking-wide text-muted">
            地区
          </span>
          <Link
            href={filterHref(filters, { province: "all", city: "all" })}
            className={`inline-flex h-8 items-center border px-3 font-mono text-[10px] tracking-wide transition ${
              filters.province === "all"
                ? "border-ink bg-ink text-paper"
                : "border-line bg-white text-muted hover:border-ink/30"
            }`}
          >
            全部
          </Link>
          {provinceOptions.map(([province, count]) => (
            <Link
              key={province}
              href={filterHref(filters, { province, city: "all" })}
              className={`inline-flex h-8 items-center border px-3 font-mono text-[10px] tracking-wide transition ${
                filters.province === province
                  ? "border-ink bg-ink text-paper"
                  : "border-line bg-white text-muted hover:border-ink/30"
              }`}
            >
              {province}
              <span className="ml-2 opacity-60">{count}</span>
            </Link>
          ))}
        </div>

        {filters.province !== "all" ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 font-mono text-[9px] tracking-wide text-muted">
              城市
            </span>
            <Link
              href={filterHref(filters, { city: "all" })}
              className={`inline-flex h-8 items-center border px-3 font-mono text-[10px] tracking-wide transition ${
                filters.city === "all"
                  ? "border-ink bg-ink text-paper"
                  : "border-line bg-white text-muted hover:border-ink/30"
              }`}
            >
              全部
            </Link>
            {cityOptions.map(([city, count]) => (
              <Link
                key={city}
                href={filterHref(filters, { city })}
                className={`inline-flex h-8 items-center border px-3 font-mono text-[10px] tracking-wide transition ${
                  filters.city === city
                    ? "border-ink bg-ink text-paper"
                    : "border-line bg-white text-muted hover:border-ink/30"
                }`}
              >
                {city}
                <span className="ml-2 opacity-60">{count}</span>
              </Link>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 font-mono text-[9px] tracking-wide text-muted">
            行业
          </span>
          <Link
            href={filterHref(filters, { industry: "all" })}
            className={`inline-flex h-8 items-center border px-3 font-mono text-[10px] tracking-wide transition ${
              filters.industry === "all"
                ? "border-ink bg-ink text-paper"
                : "border-line bg-white text-muted hover:border-ink/30"
            }`}
          >
            全部
          </Link>
          {industryOptions.map(([industry, count]) => (
            <Link
              key={industry}
              href={filterHref(filters, { industry })}
              className={`inline-flex h-8 items-center border px-3 font-mono text-[10px] tracking-wide transition ${
                filters.industry === industry
                  ? "border-ink bg-ink text-paper"
                  : "border-line bg-white text-muted hover:border-ink/30"
              }`}
            >
              {industry}
              <span className="ml-2 opacity-60">{count}</span>
            </Link>
          ))}
          {hasFilter ? (
            <Link
              href="/companies"
              className="ml-1 text-[11px] text-accent underline underline-offset-4"
            >
              清除筛选
            </Link>
          ) : null}
        </div>
      </div>

      <p className="mt-5 font-mono text-[10px] text-muted">
        当前筛选：{companies.length} 家
      </p>

      {companies.length === 0 ? (
        <p className="mt-6 border-y border-line py-12 text-sm text-muted">
          这个筛选下还没有收录企业。未收录不代表没有风险。
        </p>
      ) : (
        orderedGroups.map((group) => (
          <section key={group.province} className="mt-8 border-t-2 border-ink pt-4">
            <div className="flex items-baseline justify-between">
              <h2 className="font-serif text-2xl font-semibold tracking-tight">
                {group.province}
              </h2>
              <span className="font-mono text-[10px] text-muted">
                {group.total} 家
              </span>
            </div>

            {Array.from(group.cities.entries()).map(([city, rows]) => (
              <div key={city} className="mt-4">
                <h3 className="font-mono text-[10px] tracking-[0.18em] text-accent">
                  {city}
                </h3>
                <div className="mt-1 grid gap-x-10 sm:grid-cols-2">
                  {rows.map((company) => (
                    <Link
                      key={company.id}
                      href={`/company/${company.id}`}
                      className="group block border-t border-line py-4"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-mono text-[9px] tracking-[0.18em] text-accent">
                          {recordLabel(company.signals[0])}
                        </span>
                        <span className="font-mono text-[9px] text-muted">
                          {company.signals[0]?.sourcePublishedAt
                            ? formatDate(company.signals[0].sourcePublishedAt)
                            : "暂无公开日期"}
                        </span>
                      </div>
                      <h4 className="mt-1.5 font-serif text-lg font-medium leading-snug transition group-hover:text-accent">
                        {company.name}
                      </h4>
                      <p className="mt-1 text-xs text-muted">
                        {[company.city, company.industry]
                          .filter(Boolean)
                          .join(" · ") || "地区与行业待补充"}{" "}
                        · {company._count.signals} 条信号
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
