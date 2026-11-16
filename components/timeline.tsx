import { formatDate } from "@/lib/format";
import type { TimelineEvent } from "@/lib/timeline";

export function Timeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted">
        暂无可展示的公开节点。空白不代表没有发生，只代表我们还没有采到可核验的来源。
      </p>
    );
  }

  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="absolute bottom-1 left-[6px] top-1 w-px bg-line md:hidden"
      />
      <div
        aria-hidden="true"
        className="absolute left-0 right-0 top-[7px] hidden h-px bg-line md:block"
      />
      <ol className="relative flex flex-col gap-6 md:flex-row md:gap-5">
        {events.map((event) => (
          <li
            key={`${event.date.toISOString()}-${event.label}`}
            className="relative flex gap-3 md:flex-1 md:flex-col md:gap-2"
          >
            <span
              aria-hidden="true"
              className={`relative z-10 mt-1 h-3.5 w-3.5 shrink-0 rounded-full border ${
                event.attention
                  ? "border-ink bg-ink"
                  : "border-ink/30 bg-paper"
              }`}
            />
            <div className="min-w-0 pb-1">
              <p className="font-mono text-[11px] tracking-wide text-muted">
                {event.dateLabel ?? formatDate(event.date)}
              </p>
              <p className="mt-1 font-serif text-sm font-medium">{event.label}</p>
              {event.detail ? (
                <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-muted">
                  {event.detail}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
