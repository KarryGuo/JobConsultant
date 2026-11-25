import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EvidenceText } from "@/components/evidence-text";
import type { EvidenceItem } from "@/components/evidence-dialog";
import { FeedbackSummary } from "@/components/feedback-summary";
import { OfficialLookup } from "@/components/official-lookup";
import { ReportFeedback } from "@/components/report-feedback";
import { SeverityLabel } from "@/components/severity-label";
import { Timeline } from "@/components/timeline";
import { appealCategoryLabel } from "@/lib/appeal";
import { COVERAGE_SUMMARY } from "@/lib/coverage";
import { prisma } from "@/lib/db";
import { summarizeFeedback } from "@/lib/feedback";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  isStale,
  latestVerificationAt,
  staleSignals,
} from "@/lib/freshness";
import { getCompanyReport } from "@/lib/report-service";
import { SITE_URL } from "@/lib/site";
import { buildTimeline } from "@/lib/timeline";
import type { ReportPoint } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const company = await prisma.company.findUnique({
    where: { id },
    select: { name: true, city: true, industry: true },
  });

  if (!company) return { title: "企业未收录" };

  const place = [company.city, company.industry].filter(Boolean).join(" · ");
  const title = `${company.name} · 求职调查`;
  const description = `${company.name}${
    place ? `（${place}）` : ""
  }的公开记录整理。每条结论都能点回原始来源；查不到不代表安全。`;
  const canonical = `/company/${id}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      url: canonical,
      siteName: "职顾问",
      title,
      description,
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
    robots: { index: true, follow: true },
  };
}

export default async function CompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await getCompanyReport(id);

  if (!result) notFound();

  const { company, signals, report, feedbacks } = result;
  const hasSignals = signals.length > 0;
  const sourceUrls = Array.from(
    new Set(signals.map((signal) => signal.sourceUrl)),
  ).slice(0, 5);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: company.name,
    url: `${SITE_URL}/company/${company.id}`,
    ...(company.creditCode ? { identifier: company.creditCode } : {}),
    ...(company.province || company.city
      ? {
          address: {
            "@type": "PostalAddress",
            ...(company.province ? { addressRegion: company.province } : {}),
            ...(company.city ? { addressLocality: company.city } : {}),
          },
        }
      : {}),
    ...(sourceUrls.length > 0
      ? {
          subjectOf: sourceUrls.map((url) => ({
            "@type": "WebPage",
            url,
          })),
        }
      : {}),
  };
  const points = report.points as unknown as ReportPoint[];
  const timeline = buildTimeline(company, signals);
  const feedbackStats = summarizeFeedback(feedbacks);
  const lastVerifiedAt = latestVerificationAt(signals);
  const stale = staleSignals(signals);
  const nextReviewAt = signals.reduce<Date | null>(
    (earliest, signal) =>
      signal.nextReviewAt &&
      (!earliest || signal.nextReviewAt.getTime() < earliest.getTime())
        ? signal.nextReviewAt
        : earliest,
    null,
  );

  const corrections = await prisma.appealRequest.findMany({
    where: {
      companyId: company.id,
      status: "resolved",
      publicNote: { not: null },
    },
    orderBy: [{ handledAt: "desc" }, { updatedAt: "desc" }],
    take: 10,
    select: {
      id: true,
      category: true,
      publicNote: true,
      handledAt: true,
      updatedAt: true,
    },
  });
  const visibleCorrections = corrections.filter(
    (correction) => (correction.publicNote ?? "").trim().length > 0,
  );

  const auditRows =
    signals.length > 0
      ? await prisma.signalAuditEvent.findMany({
          where: { signalId: { in: signals.map((signal) => signal.id) } },
          orderBy: { createdAt: "desc" },
          select: {
            signalId: true,
            action: true,
            createdAt: true,
          },
        })
      : [];
  const latestAuditBySignalId = new Map<
    string,
    { action: string; createdAt: string }
  >();
  for (const row of auditRows) {
    if (!row.signalId || latestAuditBySignalId.has(row.signalId)) continue;
    latestAuditBySignalId.set(row.signalId, {
      action: row.action,
      createdAt: row.createdAt.toISOString(),
    });
  }

  const evidenceBySignalId = new Map<string, EvidenceItem>(
    signals.map((signal) => [
      signal.id,
      {
        signalId: signal.id,
        sourceTitle: signal.sourceTitle,
        sourceUrl: signal.sourceUrl,
        sourcePublishedAt: signal.sourcePublishedAt?.toISOString() ?? null,
        fetchedAt: signal.fetchedAt.toISOString(),
        period: signal.period,
        snapshotHash: signal.snapshotHash,
        lastVerifiedAt: signal.lastVerifiedAt?.toISOString() ?? null,
        nextReviewAt: signal.nextReviewAt?.toISOString() ?? null,
        reviewCycleDays: signal.reviewCycleDays,
        stale: isStale(signal.nextReviewAt),
        hasSnapshot: Boolean(signal.snapshotPath),
        lastAudit: latestAuditBySignalId.get(signal.id) ?? null,
      },
    ]),
  );

  const questions = Array.from(
    new Set(points.flatMap((point) => point.questions)),
  ).slice(0, 3);

  const missing = [
    !company.establishedAt ? "成立时间" : null,
    !signals.some((signal) => signal.type === "insured_drop") ? "参保人数变化" : null,
    !signals.some((signal) => signal.type === "court_exec") ? "被执行记录" : null,
    !signals.some((signal) => signal.type === "hiring_anomaly") ? "岗位挂出时长" : null,
  ].filter((item): item is string => Boolean(item));

  const appealHref = `/appeal?company=${encodeURIComponent(
    company.name,
  )}&companyId=${company.id}&report=${report.id}`;

  return (
    <article className="mx-auto max-w-4xl pb-28 pt-8 md:pb-12 md:pt-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/"
          className="text-xs text-muted underline underline-offset-4 transition hover:text-ink"
        >
          ← 查另一家公司
        </Link>
        <span className="font-mono text-[9px] tracking-[0.2em] text-muted">
          调查档案 / FILE {report.id.slice(-6).toUpperCase()}
        </span>
      </div>

      <header className="mt-6 border-b border-line pb-7">
        <p className="font-mono text-[10px] tracking-[0.2em] text-accent">
          调查对象 / SUBJECT
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted">
          <span className="border border-accent/40 px-1.5 py-0.5 font-mono tracking-wide text-accent">
            {hasSignals ? "公开数据" : "主体档案"}
          </span>
          <span>
            {hasSignals
              ? company.depth === 1
                ? "深度档案"
                : "基础信号"
              : "仅主体信息"}
          </span>
          {company.province ? <span>· {company.province}</span> : null}
          {company.city ? <span>· {company.city}</span> : null}
          {company.industry ? <span>· {company.industry}</span> : null}
        </div>

        <h1 className="mt-4 font-serif text-[clamp(2rem,4.2vw,3.2rem)] font-semibold leading-[1.14] tracking-[-0.015em]">
          {company.name}
        </h1>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] leading-5 text-muted">
            <span>信用代码 {company.creditCode ?? "未收录"}</span>
            {hasSignals ? (
              <>
                <span>数据截止 {formatDateTime(report.dataCutoff)}</span>
                <span>最后核验 {formatDate(lastVerifiedAt)}</span>
                <span>下次复核 {formatDate(nextReviewAt)}</span>
              </>
            ) : (
              <>
                <span>收录状态 主体已收录</span>
                <span>风险信号 暂未命中</span>
                <span>公开来源 待补充</span>
              </>
            )}
          </div>
          <span
            className={`inline-flex items-center gap-1.5 font-mono text-[9px] tracking-[0.18em] ${
              hasSignals ? "text-accent" : "text-muted"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 ${
                hasSignals ? "bg-accent" : "bg-muted"
              }`}
              aria-hidden="true"
            />
            {hasSignals ? "来源已核实" : "主体已收录"}
          </span>
        </div>
      </header>

      <details className="mt-6 border border-line bg-white/70 px-4 py-2.5">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-mono text-[10px] tracking-[0.18em] text-accent [&::-webkit-details-marker]:hidden">
          覆盖范围 / COVERAGE
          <span className="text-muted">展开</span>
        </summary>
        <p className="mb-2 mt-1 text-xs leading-6 text-muted">
          {COVERAGE_SUMMARY}
        </p>
      </details>

      {stale.length > 0 ? (
        <section className="mt-4 border-l-2 border-accent bg-accent-soft/50 px-4 py-3">
          <p className="font-mono text-[9px] tracking-[0.18em] text-accent">
            数据已过期 / STALE
          </p>
          <p className="mt-1 text-sm leading-6">
            本页有 {stale.length} 条记录超过复核周期，结论可能已失效。最近核验：
            {formatDate(lastVerifiedAt)}。
          </p>
        </section>
      ) : null}

      <section className="mt-9 border-l-2 border-accent pl-5 sm:pl-6">
        <p className="font-mono text-[10px] tracking-[0.18em] text-accent">
          调查结论 / FINDING
        </p>
        <p className="mt-3 font-serif text-[clamp(1.4rem,2.7vw,2rem)] font-medium leading-[1.42]">
          {report.conclusion}
        </p>
        <p className="mt-4 max-w-2xl text-xs leading-6 text-muted">
          这不是判决书。我们只是把公开记录摆在一起，提醒你在面试时多问一句。数字全部来自原始记录，措辞由模板生成。
        </p>
      </section>

      <section className="mt-12">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-t-2 border-ink pt-5">
          <h2 className="font-serif text-xl font-semibold sm:text-2xl">
            发生了什么
          </h2>
          <span className="font-mono text-[9px] tracking-[0.18em] text-accent">
            时间线 / CHRONOLOGY
          </span>
        </div>
        <div className="mt-7">
          <Timeline events={timeline} />
        </div>
      </section>

      <section className="mt-14">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-t-2 border-ink pt-5">
          <div>
            <p className="font-mono text-[9px] tracking-[0.2em] text-accent">
              发现 / FINDINGS
            </p>
            <h2 className="mt-1 font-serif text-xl font-semibold sm:text-2xl">
              值得注意的公开记录
            </h2>
          </div>
          <span className="font-mono text-[10px] text-muted">
            {points.length} 条
          </span>
        </div>

        {points.length === 0 ? (
          <div className="mt-5 border border-line bg-white/70 p-5">
            <p className="text-sm font-medium">
              该主体已收录，本次没有命中已收录的风险规则
            </p>
            <p className="mt-2 text-sm leading-6 text-muted">
              这只代表已收录来源里没有相关记录，不代表公司没有风险。
              被执行、经营异常、失信、破产重整、欠税等暂未覆盖，请结合下方的自查入口判断。
            </p>
          </div>
        ) : (
          <ol className="mt-5 border-y border-line">
            {points.map((point, index) => {
              const evidence = point.signalIds
                .map((signalId) => evidenceBySignalId.get(signalId))
                .filter((item): item is EvidenceItem => Boolean(item));

              return (
                <li
                  key={`${point.ruleId}-${point.signalIds.join("-")}`}
                  className="py-6"
                >
                  <p className="mb-3">
                    <span className="inline-block bg-lime px-1.5 py-0.5 font-mono text-[9px] tracking-[0.2em] text-ink">
                      发现 0{index + 1}
                    </span>
                  </p>
                  <div className="flex items-start gap-3">
                    <SeverityLabel severity={point.severity} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] leading-7">
                        <EvidenceText
                          text={point.text}
                          evidence={evidence}
                          appealHref={appealHref}
                        />
                      </div>

                      <details className="group mt-4 [&::-webkit-details-marker]:hidden">
                        <summary className="list-none cursor-pointer font-mono text-[10px] tracking-wide text-muted transition hover:text-ink">
                          另一种可能
                          <span className="ml-1 inline-block transition group-open:rotate-45">
                            +
                          </span>
                        </summary>
                        <p className="mt-2 text-sm leading-6 text-muted">
                          {point.benign}
                        </p>
                      </details>

                      <div className="mt-4 border-t border-line pt-3">
                        <p className="font-mono text-[10px] tracking-wide text-muted">
                          你可以做的
                        </p>
                        <p className="mt-1 text-sm leading-6">{point.action}</p>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {questions.length > 0 ? (
        <section className="mt-14">
          <div className="border-t-2 border-ink pt-5">
            <p className="font-mono text-[9px] tracking-[0.2em] text-accent">
              带进面试的三个问题 / QUESTIONS
            </p>
            <h2 className="mt-1 font-serif text-xl font-semibold sm:text-2xl">
              面试时你可以问
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              不用质问，只是把疑点问清楚。对方支支吾吾，也是一种信息。
            </p>
          </div>

          <ol className="mt-6 grid gap-6 sm:grid-cols-3">
            {questions.map((question, index) => (
              <li key={question} className="border-t border-line pt-4">
                <span className="font-mono text-[10px] tracking-[0.18em] text-accent">
                  0{index + 1}
                </span>
                <p className="mt-2 font-serif text-lg leading-snug">{question}</p>
              </li>
            ))}
          </ol>

          <Link
            href={`/feedback/${company.id}`}
            className="mt-5 inline-flex text-sm text-accent underline underline-offset-4"
          >
            把这段面试经历匿名留下来 →
          </Link>
        </section>
      ) : null}

      {visibleCorrections.length > 0 ? (
        <section className="mt-14">
          <div className="border-t-2 border-ink pt-5">
            <p className="font-mono text-[9px] tracking-[0.2em] text-accent">
              更正记录 / CORRECTIONS
            </p>
            <h2 className="mt-1 font-serif text-xl font-semibold sm:text-2xl">
              已核实的更正
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              企业提交可核验材料，我们核对后对公开记录作出以下更正。原记录不会消失，更正本身也留痕。
            </p>
          </div>

          <ol className="mt-5 divide-y divide-line border-y border-line">
            {visibleCorrections.map((correction) => (
              <li key={correction.id} className="py-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-muted">
                  <span>
                    {formatDate(correction.handledAt ?? correction.updatedAt)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{appealCategoryLabel(correction.category)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7">
                  {correction.publicNote}
                </p>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section className="mt-14 border-t border-line pt-6">
        <p className="font-mono text-[9px] tracking-[0.2em] text-accent">
          调查边界 / LIMITS
        </p>
        <h2 className="mt-1 font-serif text-lg font-semibold">
          这份报告没有覆盖什么
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          未检索到不等于没有。以下信息没有可核验来源，或不在当前收录范围：
        </p>
        <ul className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
          {missing.length > 0 ? (
            missing.map((item) => (
              <li key={item} className="border border-line px-2 py-1">
                {item}
              </li>
            ))
          ) : (
            <li className="border border-line px-2 py-1">
              当前已覆盖主要公开来源，但仍可能存在未公开信息
            </li>
          )}
        </ul>
        <div className="mt-4">
          <OfficialLookup companyName={company.name} compact />
        </div>
        <p className="mt-4 border-t border-line pt-4 text-sm">
          <Link
            href={appealHref}
            className="text-accent underline underline-offset-4"
          >
            发现记录有误？提交企业申诉或更正 →
          </Link>
        </p>
      </section>

      <FeedbackSummary companyId={company.id} stats={feedbackStats} />

      <section className="mt-10 border-t border-line pt-8">
        <ReportFeedback reportId={report.id} />
      </section>

      <p className="mt-8 border-t border-line pt-4 font-mono text-[10px] leading-5 text-muted">
        {hasSignals ? (
          <>
            报告生成时间 {formatDateTime(report.generatedAt)} · 数据截止{" "}
            {formatDateTime(report.dataCutoff)}
          </>
        ) : (
          <>
            主体收录时间 {formatDateTime(company.createdAt)} · 暂无公开风险信号 ·
            页面生成于 {formatDateTime(report.generatedAt)}
          </>
        )}
      </p>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-4xl gap-2">
          <Link
            href={`/feedback/${company.id}`}
            className="flex-1 bg-ink px-4 py-3 text-center text-sm text-paper"
          >
            提交面试反馈
          </Link>
          <Link
            href="/"
            className="border border-line bg-white px-4 py-3 text-center text-sm"
          >
            查另一家
          </Link>
        </div>
      </div>
    </article>
  );
}
