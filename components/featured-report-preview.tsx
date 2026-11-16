import Link from "next/link";
import { formatCompactDate } from "@/lib/format";
import { evaluateRules } from "@/lib/rules";
import { buildTemplateReport } from "@/lib/template";
import { buildTimeline } from "@/lib/timeline";
import type { SignalLike } from "@/lib/types";

type FeaturedCompany = {
  id: string;
  name: string;
  city: string | null;
  industry: string | null;
  establishedAt: Date | null;
  signals: Array<{
    id: string;
    type: string;
    period: string | null;
    value: unknown;
    severity: string;
    sourceUrl: string;
    sourceTitle: string;
    sourcePublishedAt: Date | null;
    fetchedAt: Date;
    snapshotHash: string;
    snapshotPath: string | null;
  }>;
};

export function FeaturedReportPreview({
  company,
}: {
  company: FeaturedCompany | null;
}) {
  if (!company) return null;

  const signals: SignalLike[] = company.signals.map((signal) => ({
    id: signal.id,
    type: signal.type,
    period: signal.period,
    value: signal.value,
    severity: signal.severity,
    sourceUrl: signal.sourceUrl,
    sourceTitle: signal.sourceTitle,
    sourcePublishedAt: signal.sourcePublishedAt,
    fetchedAt: signal.fetchedAt,
    snapshotHash: signal.snapshotHash,
    snapshotPath: signal.snapshotPath,
  }));

  const dataCutoff = signals.reduce<Date | null>(
    (latest, signal) =>
      !latest || signal.fetchedAt.getTime() > latest.getTime()
        ? signal.fetchedAt
        : latest,
    null,
  );
  const hits = evaluateRules(signals);
  const draft = buildTemplateReport(hits, dataCutoff);
  const point = draft.points[0];
  const events = buildTimeline(company, signals).slice(0, 3);

  if (!point) return null;

  const source = signals.find((signal) => signal.sourcePublishedAt);

  return (
    <aside className="relative lg:mt-8" aria-label="真实报告节选">
      <div className="relative border border-ink bg-white">
        <div className="flex items-center justify-between bg-ink px-5 py-2.5 font-mono text-[9px] tracking-[0.18em] text-paper">
          <span>报告节选 / EXCERPT</span>
          <span>{formatCompactDate(source?.sourcePublishedAt ?? dataCutoff)}</span>
        </div>

        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[9px] tracking-[0.2em] text-accent">
                本期档案 / CASE
              </p>
              <h2 className="mt-1.5 font-serif text-2xl font-semibold leading-snug">
                {company.name}
              </h2>
            </div>
            <span className="mt-1 inline-flex shrink-0 items-center gap-1.5 font-mono text-[8px] tracking-[0.16em] text-accent">
              <span className="h-1 w-1 bg-accent" aria-hidden="true" />
              来源已核实
            </span>
          </div>

          <p className="mt-1.5 text-[11px] text-muted">
            {[company.city, company.industry].filter(Boolean).join(" · ") ||
              "地区与行业待补充"}
          </p>

          <p className="mt-4 border-l-2 border-accent pl-3 font-serif text-base leading-relaxed">
            {draft.conclusion}
          </p>

          <ol className="mt-5 space-y-3 border-t border-line pt-4">
            {events.map((event) => (
              <li
                key={`${event.date.toISOString()}-${event.label}`}
                className="grid grid-cols-[72px_1fr] gap-3"
              >
                <span className="font-mono text-[10px] leading-5 text-muted">
                  {event.dateLabel ?? formatCompactDate(event.date)}
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium leading-5">{event.label}</p>
                  <p className="line-clamp-1 text-[10px] leading-4 text-muted">
                    {event.detail}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <p className="mt-4 line-clamp-3 border-t border-line pt-3 text-[11px] leading-5 text-muted">
            {point.text}
          </p>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
            <Link
              href={`/company/${company.id}`}
              className="inline-flex items-center gap-1 text-sm font-medium text-accent underline-offset-4 hover:underline"
            >
              查看完整档案 <span aria-hidden="true">→</span>
            </Link>
            <span className="font-mono text-[9px] text-muted">真实节选</span>
          </div>

          <p className="mt-3 text-[10px] leading-5 text-muted">
            每个数字都能点回原始来源；结论不是评分，是提醒。
          </p>
        </div>
      </div>
    </aside>
  );
}
