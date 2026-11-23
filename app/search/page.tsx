import Link from "next/link";
import { redirect } from "next/navigation";
import { CoverageRequestForm } from "@/components/coverage-request-form";
import { OfficialLookup } from "@/components/official-lookup";
import { SearchForm } from "@/components/search-form";
import { matchCompany } from "@/lib/match";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const query = q.trim();

  if (!query) redirect("/");

  const result = await matchCompany(query);

  if (result.kind === "hit") {
    redirect(`/company/${result.company.id}`);
  }

  return (
    <div className="mx-auto max-w-2xl pb-16 pt-12">
      <Link href="/" className="text-xs text-muted underline underline-offset-4 transition hover:text-ink">
        ← 返回首页
      </Link>

      <p className="mt-7 font-mono text-[10px] tracking-[0.2em] text-accent">
        检索 / SEARCH
      </p>
      <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight">
        {result.kind === "candidates" ? "找到几家可能的公司" : "暂未收录这家公司"}
      </h1>
      <p className="mt-2 text-sm leading-6 text-muted">
        {result.kind === "candidates"
          ? "为了不认错公司，我们没有自动选择。请确认你要查的是哪一家。"
          : `没有找到与「${query}」匹配的已收录企业。未收录不代表公司有问题，只代表我们还没有可核验的来源；同样不代表公司没有问题或没有风险。`}
      </p>

      {result.kind === "candidates" ? (
        <>
          <ul className="mt-7 divide-y divide-line border-y border-line">
            {result.candidates.map((company) => (
              <li key={company.id}>
                <Link
                  href={`/company/${company.id}`}
                  className="group flex items-center justify-between gap-4 py-4"
                >
                  <div className="min-w-0">
                    <p className="truncate font-serif text-base font-medium transition group-hover:text-accent">
                      {company.name}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {[company.province, company.city, company.industry]
                        .filter(Boolean)
                        .join(" · ") || "地区与行业待补充"}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-[10px] text-muted">
                    {company.depth === 1 ? "深度档案" : "基础信号"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-6">
            <OfficialLookup companyName={query} />
          </div>
        </>
      ) : (
        <>
          <div className="mt-7 border-y border-line py-5 text-sm leading-6 text-muted">
            <p>你可以试试：</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>换用公司全称，例如「陕西知途科技互联网有限责任公司」</li>
              <li>换用统一社会信用代码</li>
              <li>换用更短的简称，例如「知途」</li>
            </ul>
            <p className="mt-4">
              我们宁可返回“没有查到”，也不会猜一个最像的公司给你。
            </p>
            <p className="mt-3 border-l-2 border-accent pl-3 text-xs leading-6 text-muted">
              当前只覆盖劳动用工公开记录。被执行、经营异常、失信、破产重整、欠税等暂未覆盖，
              “没有查到”不能用来判断一家公司是否安全。
            </p>
            <Link
              href="/companies"
              className="mt-3 inline-flex text-sm text-accent underline underline-offset-4"
            >
              先看看我们收录了哪些公司 →
            </Link>
          </div>

          <div className="mt-6">
            <OfficialLookup companyName={query} />
          </div>

          <section
            id="coverage-request"
            className="mt-10 border-t-2 border-ink pt-5"
          >
            <p className="font-mono text-[10px] tracking-[0.18em] text-accent">
              收录请求 / COVERAGE REQUEST
            </p>
            <h2 className="mt-1 font-serif text-xl font-semibold">
              请我们收录这家公司
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              提交后进入后台收录队列。我们会先找到可核验的官方来源，再决定是否展示记录；
              提交本身不会产生任何风险结论，也不代表公司有问题。
            </p>
            <CoverageRequestForm defaultCompanyName={query} />
          </section>
        </>
      )}

      <div className="mt-8">
        <SearchForm defaultValue={query} />
      </div>
    </div>
  );
}
