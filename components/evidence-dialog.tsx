"use client";

import Link from "next/link";
import { useEffect } from "react";
import { formatDate, formatDateTime, formatHash, formatPeriod } from "@/lib/format";

export type EvidenceItem = {
  signalId: string;
  sourceTitle: string;
  sourceUrl: string;
  sourcePublishedAt: string | null;
  fetchedAt: string;
  period: string | null;
  snapshotHash: string;
  lastVerifiedAt: string | null;
  nextReviewAt: string | null;
  reviewCycleDays: number;
  stale: boolean;
};

type Props = {
  items: EvidenceItem[];
  open: boolean;
  onClose: () => void;
  appealHref?: string;
};

export function EvidenceDialog({
  items,
  open,
  onClose,
  appealHref,
}: Props) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/35 p-3 sm:items-center sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="evidence-title"
        className="max-h-[86vh] w-full max-w-2xl overflow-y-auto border border-ink bg-paper p-5 shadow-2xl sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="evidence-title" className="font-serif text-lg font-semibold">
              证据与来源
            </h2>
            <p className="mt-1 text-xs text-muted">
              每条结论都绑定到具体信号；原始网页可能更新或失效。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="border border-line px-2.5 py-1 text-xs text-muted transition hover:border-ink/40 hover:text-ink"
            aria-label="关闭证据弹窗"
          >
            关闭
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {items.map((item, index) => (
            <article
              key={item.signalId}
              className={index > 0 ? "border-t border-line pt-4" : undefined}
            >
              <p className="font-serif text-base font-medium leading-relaxed">
                {item.sourceTitle}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div>
                  <dt className="text-muted">数据所属期</dt>
                  <dd className="mt-0.5 font-mono">{formatPeriod(item.period)}</dd>
                </div>
                <div>
                  <dt className="text-muted">来源公布时间</dt>
                  <dd className="mt-0.5 font-mono">{formatDate(item.sourcePublishedAt)}</dd>
                </div>
                <div>
                  <dt className="text-muted">抓取时间</dt>
                  <dd className="mt-0.5 font-mono">{formatDateTime(item.fetchedAt)}</dd>
                </div>
                <div>
                  <dt className="text-muted">最后核验</dt>
                  <dd className="mt-0.5 font-mono">
                    {formatDateTime(item.lastVerifiedAt)}
                    {item.stale ? (
                      <span className="ml-2 text-accent">已超期</span>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">复核周期</dt>
                  <dd className="mt-0.5 font-mono">
                    {item.reviewCycleDays} 天 · 下次{" "}
                    {formatDate(item.nextReviewAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">快照哈希</dt>
                  <dd className="mt-0.5 truncate font-mono" title={item.snapshotHash}>
                    {formatHash(item.snapshotHash)}
                  </dd>
                </div>
              </dl>
              <a
                href={item.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-4 inline-flex items-center gap-1 text-sm text-accent underline underline-offset-4 hover:text-ink"
              >
                打开原始网页
                <span aria-hidden="true">↗</span>
              </a>
            </article>
          ))}
        </div>

        <p className="mt-6 border-t border-line pt-4 text-[11px] leading-relaxed text-muted">
          我们保存抓取时的页面快照哈希，用于证明这条记录在入库时存在。哈希不能防止原始网页后续被修改或删除；如果你发现链接失效或记录有误，可以{" "}
          <Link
            href={appealHref ?? "/appeal"}
            className="text-accent underline underline-offset-4 hover:text-ink"
          >
            提交申诉或更正
          </Link>
          。
        </p>
      </div>
    </div>
  );
}
