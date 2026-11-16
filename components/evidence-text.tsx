"use client";

import { useState } from "react";
import { EvidenceDialog, type EvidenceItem } from "./evidence-dialog";

type Props = {
  text: string;
  evidence: EvidenceItem[];
  className?: string;
  appealHref?: string;
};

/**
 * 把正文里的数字渲染成可点击的证据入口。
 * 没有证据时不显示任何可点击样式。
 */
export function EvidenceText({
  text,
  evidence,
  className,
  appealHref,
}: Props) {
  const [open, setOpen] = useState(false);

  if (evidence.length === 0) {
    return <span className={className}>{text}</span>;
  }

  const parts = text.split(/(\d+(?:\.\d+)?)/g);

  return (
    <>
      <span className={className}>
        {parts.map((part, index) =>
          /^\d/.test(part) ? (
            <button
              key={`${part}-${index}`}
              type="button"
              onClick={() => setOpen(true)}
              className="font-mono tabular-nums underline decoration-accent/50 decoration-dotted underline-offset-4 transition hover:decoration-accent"
              aria-label={`查看数字 ${part} 的来源证据`}
            >
              {part}
            </button>
          ) : (
            <span key={`text-${index}`}>{part}</span>
          ),
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="ml-2 align-baseline text-xs text-accent underline underline-offset-4 hover:text-ink"
        >
          证据
        </button>
      </span>
      <EvidenceDialog
        items={evidence}
        open={open}
        onClose={() => setOpen(false)}
        appealHref={appealHref}
      />
    </>
  );
}
