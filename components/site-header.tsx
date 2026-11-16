import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-t-2 border-ink border-b border-line bg-paper/90 text-ink backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link
          href="/"
          className="flex items-center gap-2.5"
          aria-label="职顾问首页"
        >
          <span className="flex h-7 w-7 items-center justify-center bg-ink font-serif text-[13px] leading-none text-paper">
            档
          </span>
          <span className="font-serif text-xl font-semibold tracking-tight">
            职顾问
          </span>
          <span className="hidden border-l border-line pl-2.5 font-mono text-[9px] tracking-[0.18em] text-accent sm:inline">
            求职调查
          </span>
        </Link>

        <div className="flex items-center gap-3 sm:gap-6">
          <nav className="flex items-center gap-4 text-[13px] text-muted sm:gap-5">
            <Link href="/companies" className="transition hover:text-ink">
              企业列表
            </Link>
            <Link
              href="/about"
              className="hidden transition hover:text-ink sm:inline"
            >
              我们查不到什么
            </Link>
          </nav>
          <Link
            href="/#search"
            className="inline-flex h-9 items-center rounded-none bg-ink px-3 text-xs font-medium text-paper transition hover:bg-accent sm:px-4"
          >
            查一家公司
          </Link>
        </div>
      </div>
    </header>
  );
}
