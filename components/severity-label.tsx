import type { Severity } from "@/lib/types";

const LABELS: Record<Severity, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

export function SeverityLabel({ severity }: { severity: Severity }) {
  return (
    <span
      className={`inline-flex h-6 items-center rounded border px-2 text-[11px] leading-none tracking-wide ${
        severity === "high"
          ? "border-ink/45 text-ink"
          : severity === "medium"
            ? "border-ink/25 text-ink/70"
            : "border-ink/15 text-ink/50"
      }`}
    >
      {LABELS[severity]}
    </span>
  );
}
