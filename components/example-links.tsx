import Link from "next/link";

const EXAMPLES = [
  { label: "知途", query: "知途" },
  { label: "腾讯", query: "腾讯" },
  { label: "字节跳动", query: "字节跳动" },
  { label: "比亚迪", query: "比亚迪" },
];

export function ExampleLinks() {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-xs text-muted">
      <span className="font-mono text-[10px] tracking-wide">试试</span>
      {EXAMPLES.map((example) => (
        <Link
          key={example.query}
          href={`/search?q=${encodeURIComponent(example.query)}`}
          className="border border-line px-3 py-1 transition hover:border-ink/40 hover:text-ink"
        >
          {example.label}
        </Link>
      ))}
    </div>
  );
}
