import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminAppealCorrectionForm } from "@/components/admin-appeal-correction-form";
import { AdminAppealStatusForm } from "@/components/admin-appeal-status-form";
import {
  appealCategoryLabel,
  appealEventLabel,
  appealStatusClass,
  appealStatusLabel,
} from "@/lib/appeal";
import { prisma } from "@/lib/db";
import { formatDateTime, formatPeriod } from "@/lib/format";
import { recordLabel } from "@/lib/record-label";

export const metadata = {
  title: "申诉详情",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminAppealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const appeal = await prisma.appealRequest.findUnique({
    where: { id },
    include: {
      events: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!appeal) notFound();

  const signals = appeal.companyId
    ? await prisma.signal.findMany({
        where: { companyId: appeal.companyId, invalidatedAt: null },
        orderBy: [{ sourcePublishedAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          type: true,
          period: true,
          value: true,
          sourceTitle: true,
          sourcePublishedAt: true,
        },
      })
    : [];

  const signalOptions = signals.map((signal) => ({
    id: signal.id,
    label: `${recordLabel(signal)} · ${
      signal.period ? formatPeriod(signal.period) : "期间未标注"
    } · ${signal.sourceTitle}`.slice(0, 90),
  }));

  const evidenceHref =
    appeal.evidenceUrl && /^https?:\/\//i.test(appeal.evidenceUrl)
      ? appeal.evidenceUrl
      : null;

  return (
    <article className="max-w-3xl">
      <Link
        href="/admin"
        className="text-xs text-muted underline underline-offset-4 transition hover:text-ink"
      >
        ← 返回申诉队列
      </Link>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex border px-2 py-0.5 font-mono text-[9px] tracking-wide ${appealStatusClass(
            appeal.status,
          )}`}
        >
          {appealStatusLabel(appeal.status)}
        </span>
        <span className="font-mono text-[10px] tracking-wide text-muted">
          {appealCategoryLabel(appeal.category)}
        </span>
      </div>

      <h1 className="mt-4 font-serif text-3xl font-semibold tracking-tight">
        {appeal.companyName}
      </h1>

      <dl className="mt-6 grid gap-4 border-y border-line py-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted">收到时间</dt>
          <dd className="mt-1 font-mono text-xs">
            {formatDateTime(appeal.createdAt)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">办结时间</dt>
          <dd className="mt-1 font-mono text-xs">
            {appeal.handledAt ? formatDateTime(appeal.handledAt) : "尚未办结"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">联系方式</dt>
          <dd className="mt-1 break-all font-mono text-xs">
            {appeal.contact}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">问题类型</dt>
          <dd className="mt-1">{appealCategoryLabel(appeal.category)}</dd>
        </div>
      </dl>

      <section className="mt-8">
        <h2 className="font-serif text-lg font-semibold">申诉内容</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-7">
          {appeal.details}
        </p>
      </section>

      {evidenceHref ? (
        <section className="mt-7">
          <h2 className="font-serif text-lg font-semibold">反证链接</h2>
          <a
            href={evidenceHref}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-2 inline-flex break-all text-sm text-accent underline underline-offset-4 hover:text-ink"
          >
            {evidenceHref} ↗
          </a>
        </section>
      ) : null}

      <section className="mt-7">
        <h2 className="font-serif text-lg font-semibold">上下文</h2>
        <ul className="mt-2 space-y-1 font-mono text-[10px] leading-5 text-muted">
          {appeal.companyId ? (
            <li>
              companyId:{" "}
              <Link
                href={`/company/${appeal.companyId}`}
                className="text-accent underline underline-offset-4"
              >
                {appeal.companyId}
              </Link>
            </li>
          ) : null}
          {appeal.reportId ? <li>reportId: {appeal.reportId}</li> : null}
          {appeal.signalId ? <li>signalId: {appeal.signalId}</li> : null}
          <li>appealId: {appeal.id}</li>
        </ul>
      </section>

      {appeal.publicNote ? (
        <section className="mt-7 border-l-2 border-accent pl-4">
          <h2 className="font-serif text-lg font-semibold">公示说明</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">
            {appeal.publicNote}
          </p>
        </section>
      ) : null}

      <section className="mt-7">
        <h2 className="font-serif text-lg font-semibold">处理记录</h2>
        {appeal.events.length === 0 ? (
          <p className="mt-3 text-sm text-muted">暂无处理记录。</p>
        ) : (
          <ol className="mt-4 border-t border-line">
            {appeal.events.map((event) => (
              <li key={event.id} className="border-b border-line py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {appealEventLabel(event.type)}
                  </p>
                  <div className="flex items-center gap-3">
                    {event.actor ? (
                      <span className="font-mono text-[10px] text-muted">
                        处理人 {event.actor}
                      </span>
                    ) : null}
                    <time className="font-mono text-[10px] text-muted">
                      {formatDateTime(event.createdAt)}
                    </time>
                  </div>
                </div>
                {event.fromStatus &&
                event.toStatus &&
                event.fromStatus !== event.toStatus ? (
                  <p className="mt-1 font-mono text-[10px] text-muted">
                    {appealStatusLabel(event.fromStatus)} →{" "}
                    {appealStatusLabel(event.toStatus)}
                  </p>
                ) : event.toStatus ? (
                  <p className="mt-1 font-mono text-[10px] text-muted">
                    状态：{appealStatusLabel(event.toStatus)}
                  </p>
                ) : null}
                {event.internalNote ? (
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">
                    {event.internalNote}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      <AdminAppealStatusForm
        appealId={appeal.id}
        initialStatus={appeal.status}
        initialNote={appeal.internalNote ?? ""}
      />

      <AdminAppealCorrectionForm
        appealId={appeal.id}
        signals={signalOptions}
        defaultSignalId={appeal.signalId ?? ""}
        defaultPublicNote={appeal.publicNote ?? ""}
      />
    </article>
  );
}
