import { cookies } from "next/headers";
import Link from "next/link";
import { CinematicIntro } from "@/components/cinematic-intro";
import { ExampleLinks } from "@/components/example-links";
import { FeaturedReportPreview } from "@/components/featured-report-preview";
import { NewsTicker } from "@/components/news-ticker";
import { SearchForm } from "@/components/search-form";
import { COVERED_REGIONS } from "@/lib/coverage";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { recordLabel } from "@/lib/record-label";

export const dynamic = "force-dynamic";

const METHOD = [
  {
    title: "只拿公开记录",
    body: "官方公告、执行信息、人社公示。没有来源的，不写。",
  },
  {
    title: "先判定，再措辞",
    body: "规则引擎负责命中。模型只把事实写成句子，不提供数字。",
  },
  {
    title: "每个数字都能点开",
    body: "来源、抓取时间、页面快照哈希，一个都不少。",
  },
];

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ intro?: string }>;
}) {
  const { intro } = await searchParams;
  const cookieStore = await cookies();
  const showIntro =
    cookieStore.get("zgw_intro_seen")?.value !== "1" || intro === "1";

  const [
    companies,
    totalCompanies,
    totalSignals,
    preferredFeatured,
    withSignals,
    subjectOnly,
  ] = await Promise.all([
      prisma.company.findMany({
        // 首页只展示已有公开信号的档案；仅登记主体的企业进入列表与搜索。
        where: { signals: { some: {} } },
        orderBy: { updatedAt: "desc" },
        take: 6,
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
      }),
      prisma.company.count(),
      prisma.signal.count(),
      prisma.company.findFirst({
        where: { normalized: "陕西知途科技互联网" },
        include: { signals: { orderBy: { sourcePublishedAt: "desc" } } },
      }),
      prisma.company.count({ where: { signals: { some: {} } } }),
      prisma.company.count({ where: { signals: { none: {} } } }),
    ]);

  const featured =
    preferredFeatured ??
    (await prisma.company.findFirst({
      where: { signals: { some: {} } },
      orderBy: { updatedAt: "desc" },
      include: { signals: { orderBy: { sourcePublishedAt: "desc" } } },
    }));

  const caseItems = companies.map((company) => ({
    ...company,
    label: recordLabel(company.signals[0]),
  }));

  const tickerItems = caseItems.map((company) => ({
    id: company.id,
    name: company.name,
    label: company.label,
  }));

  return (
    <div className="pb-6">
      <CinematicIntro
        show={showIntro}
        stats={{ companies: totalCompanies, signals: totalSignals }}
      />
      <NewsTicker items={tickerItems} />

      <section
        id="search"
        className="grid scroll-mt-24 gap-12 pt-12 md:grid-cols-[1.05fr_0.95fr] md:items-start md:pt-16 lg:gap-16"
      >
        <div>
          <p className="font-mono text-[10px] tracking-[0.22em] text-accent">
            求职调查 / 公开记录
          </p>
          <h1 className="mt-5 font-serif text-[clamp(3rem,6vw,5.4rem)] font-semibold leading-[0.98] tracking-[-0.03em]">
            offer 之前，
            <br />
            <span className="text-accent">先查这家公司。</span>
          </h1>
          <p className="mt-6 max-w-[34rem] text-[15px] leading-7 text-muted sm:text-base">
            输入公司名，看看它有没有欠薪、社保欠缴、招聘收费等公开记录。
            每条结论都能点回官方原文；查不到，也不代表安全。
          </p>

          <div className="mt-8 max-w-2xl">
            <SearchForm size="lg" id="company-search" emphasis />
          </div>
          <div className="mt-4">
            <ExampleLinks />
          </div>

          <p className="mt-6 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-muted">
            <span>不用登录</span>
            <span>不收钱</span>
            <span>不删帖</span>
            <span className="text-accent">查不到，不等于安全</span>
          </p>
        </div>

        <FeaturedReportPreview company={featured} />
      </section>

      <div className="mt-12 flex flex-wrap items-baseline gap-x-8 gap-y-3 border-y border-line py-4 font-mono text-[11px] text-muted">
        <span>
          <strong className="mr-1 font-serif text-xl font-semibold text-ink">
            {totalCompanies}
          </strong>
          家企业主体
        </span>
        <span>
          <strong className="mr-1 font-serif text-xl font-semibold text-ink">
            {totalSignals}
          </strong>
          条公开记录
        </span>
        <span>
          <strong className="mr-1 font-serif text-xl font-semibold text-accent">
            0
          </strong>
          个评分
        </span>
        <span className="text-muted/80">每条记录都带来源与快照</span>
      </div>

      <p className="mt-3 text-xs leading-6 text-muted">
        本期覆盖：{withSignals} 家已核验到公开信号，{subjectOnly}{" "}
        家仅收录主体信息；主要来源为{COVERED_REGIONS.join("、")}
        人社部门的劳动用工公告与一线企业公开主体。这不是全国企业库，未收录企业可在{" "}
        <Link
          href="/coverage"
          className="text-accent underline underline-offset-4"
        >
          收录请求页
        </Link>{" "}
        提交，或查看{" "}
        <Link
          href="/about#coverage"
          className="text-accent underline underline-offset-4"
        >
          覆盖范围与数据来源
        </Link>
        。
      </p>

      <section className="mt-20 grid gap-8 border-t border-line pt-12 md:grid-cols-[0.3fr_1fr]">
        <div>
          <p
            aria-hidden="true"
            className="font-serif text-7xl leading-none text-accent md:mt-1"
          >
            “
          </p>
        </div>
        <div>
          <blockquote className="font-serif text-3xl font-medium leading-[1.25] sm:text-5xl">
            签了三方，入职前一周被通知：
            <span className="inline-block whitespace-nowrap bg-ink px-1 text-paper">
              岗位取消
            </span>
            。
          </blockquote>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-muted">
            入职通知不是合同，口头承诺也不算。真正能保护你的，是签字之前问过什么。
          </p>
          <Link
            href="/companies"
            className="mt-5 inline-flex text-sm font-medium text-accent underline underline-offset-4"
          >
            看收录的企业 →
          </Link>
        </div>
      </section>

      <section className="mt-20 grid gap-10 border-t border-line pt-8 md:grid-cols-[0.8fr_1.2fr]">
        <div>
          <p className="font-mono text-[10px] tracking-[0.2em] text-accent">
            调查方法
          </p>
          <h2 className="mt-2 font-serif text-3xl font-semibold leading-tight">
            我们怎么查
          </h2>
        </div>

        <ol className="divide-y divide-line border-y border-line">
          {METHOD.map((step, index) => (
            <li
              key={step.title}
              className="grid grid-cols-[32px_1fr] gap-4 py-4"
            >
              <span className="font-mono text-[10px] tracking-[0.18em] text-accent">
                0{index + 1}
              </span>
              <div>
                <h3 className="font-serif text-lg font-medium">{step.title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-20">
        <div className="flex flex-wrap items-end justify-between gap-4 border-t border-line pt-6">
          <div>
            <h2 className="font-serif text-3xl font-semibold leading-tight">
              收录的 {totalCompanies} 家企业
            </h2>
          </div>
          <Link
            href="/companies"
            className="text-sm font-medium text-accent underline underline-offset-4"
          >
            全部档案 →
          </Link>
        </div>

        <div className="mt-6">
          <div className="hidden grid-cols-[90px_1fr_120px_60px] border-b border-line pb-2 font-mono text-[9px] tracking-wide text-muted sm:grid">
            <span>类型</span>
            <span>公司</span>
            <span>来源日期</span>
            <span className="text-right">信号</span>
          </div>

          {caseItems.map((company) => (
            <Link
              key={company.id}
              href={`/company/${company.id}`}
              className="grid grid-cols-1 gap-1 border-b border-line py-3 transition hover:bg-white/70 sm:grid-cols-[90px_1fr_120px_60px] sm:items-center"
            >
              <span className="font-mono text-[9px] tracking-[0.14em] text-accent">
                {company.label}
              </span>
              <span className="font-serif text-base font-medium leading-snug">
                {company.name}
                <span className="ml-2 font-sans text-[11px] font-normal text-muted">
                  {[company.province, company.city, company.industry]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className="font-mono text-[10px] text-muted">
                {company.signals[0]?.sourcePublishedAt
                  ? formatDate(company.signals[0].sourcePublishedAt)
                  : "暂无公开日期"}
              </span>
              <span className="font-mono text-[10px] text-muted sm:text-right">
                {company._count.signals} 条
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="relative left-1/2 mt-20 w-screen -translate-x-1/2 bg-ink py-16 text-paper sm:py-24">
        <div className="mx-auto max-w-6xl px-5">
          <p className="flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] text-lime">
            <span className="h-1.5 w-1.5 bg-lime" aria-hidden="true" />
            编辑部立场
          </p>
          <h2 className="mt-4 max-w-2xl font-serif text-4xl font-semibold leading-tight sm:text-6xl">
            我们不打分。
            <br />
            我们只记录。
          </h2>
          <p className="mt-5 max-w-xl text-sm leading-7 text-paper/60">
            不向企业收费，也不做删帖生意。查不到就写查不到。
          </p>
          <Link
            href="/about"
            className="mt-7 inline-flex text-sm text-paper/70 underline underline-offset-4"
          >
            我们查不到什么 →
          </Link>
        </div>
      </section>

      <section className="mt-20 border-t border-line pt-10">
        <div className="grid gap-8 md:grid-cols-[0.9fr_1.1fr] md:items-end">
          <div>
            <h2 className="font-serif text-3xl font-semibold leading-tight sm:text-5xl">
              现在，查一家公司。
            </h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-muted">
              查完再决定，不用告诉任何人。
            </p>
          </div>
          <div>
            <SearchForm size="lg" id="company-search-bottom" emphasis />
            <div className="mt-4">
              <ExampleLinks />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
