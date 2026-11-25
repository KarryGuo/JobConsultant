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
 * 整段结论都是证据入口：触控目标 ≥44px，数字只做强调，不再拆成小按钮。
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="查看这条发现的证据与来源"
        className={`${className ?? ""} block min-h-11 w-full cursor-pointer text-left`}
      >
        {parts.map((part, index) =>
          /^\d/.test(part) ? (
            <span
              key={`${part}-${index}`}
              className="font-mono tabular-nums underline decoration-accent/60 decoration-dotted underline-offset-4"
            >
              {part}
            </span>
          ) : (
            <span key={`text-${index}`}>{part}</span>
          ),
        )}
        <span className="mt-1.5 block font-mono text-[10px] tracking-wide text-accent">
          查看证据与来源 →
        </span>
      </button>
      <EvidenceDialog
        items={evidence}
        open={open}
        onClose={() => setOpen(false)}
        appealHref={appealHref}
      />
    </>
  );
}
