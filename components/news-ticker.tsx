import Link from "next/link";

type TickerItem = {
  id: string;
  name: string;
  label: string;
};

export function NewsTicker({ items }: { items: TickerItem[] }) {
  if (items.length === 0) return null;

  const loop = [...items, ...items];

  return (
    <div className="relative left-1/2 w-screen -translate-x-1/2 border-y border-line bg-white/60 text-ink">
      <div className="mx-auto flex max-w-6xl items-stretch overflow-hidden px-5">
        <div className="flex shrink-0 items-center gap-2 border-r border-line py-2 pr-4 font-mono text-[9px] tracking-[0.2em] text-accent">
          <span className="h-1.5 w-1.5 bg-accent" aria-hidden="true" />
          最新记录
        </div>

        <div className="relative flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_2%,black_98%,transparent)]">
          <div className="animate-marquee flex w-max items-center gap-7 py-2 pl-4">
            {loop.map((item, index) => {
              const duplicate = index >= items.length;
              return (
                <Link
                  key={`${item.id}-${index}`}
                  href={`/company/${item.id}`}
                  aria-hidden={duplicate || undefined}
                  tabIndex={duplicate ? -1 : undefined}
                  className="flex shrink-0 items-baseline gap-2 transition hover:text-accent"
                >
                  <span className="font-mono text-[9px] tracking-wide text-accent">
                    {item.label}
                  </span>
                  <span className="text-[11px] text-ink">{item.name}</span>
                  <span className="text-line" aria-hidden="true">
                    /
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
