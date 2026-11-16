import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-9 px-5 py-12 sm:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <p className="font-serif text-lg font-semibold tracking-tight">
            职顾问
          </p>
          <p className="mt-2 font-mono text-[9px] tracking-[0.18em] text-accent">
            求职调查 · VOL. 01 / 2026.11
          </p>
          <p className="mt-3 max-w-xs text-xs leading-6 text-muted">
            公开记录，求职视角。每条结论，都能点回原文。
          </p>
        </div>

        <div className="text-xs">
          <p className="font-mono text-[10px] tracking-[0.18em] text-muted">
            导航
          </p>
          <ul className="mt-3 space-y-2 text-muted">
            <li>
              <Link href="/" className="transition hover:text-ink">
                首页
              </Link>
            </li>
            <li>
              <Link href="/companies" className="transition hover:text-ink">
                企业列表
              </Link>
            </li>
            <li>
              <Link href="/about" className="transition hover:text-ink">
                我们查不到什么
              </Link>
            </li>
            <li>
              <Link href="/appeal" className="transition hover:text-ink">
                企业申诉 / 更正
              </Link>
            </li>
            <li>
              <Link
                href="/appeal/status"
                className="transition hover:text-ink"
              >
                申诉进度查询
              </Link>
            </li>
            <li>
              <Link href="/?intro=1" className="transition hover:text-ink">
                重播开场
              </Link>
            </li>
          </ul>
        </div>

        <div className="text-xs leading-6">
          <p className="font-mono text-[10px] tracking-[0.18em] text-muted">
            立场
          </p>
          <p className="mt-3 text-muted">
            不向企业收费
            <br />
            不接受删帖
            <br />
            核心功能永久免费
          </p>
        </div>
      </div>

      <div className="border-t border-line">
        <div className="mx-auto max-w-6xl px-5 pb-20 pt-4 text-[10px] leading-5 text-muted sm:pb-4">
          职顾问 · 公开数据整理，不构成法律意见。企业可提交反证并要求更正。
        </div>
      </div>
    </footer>
  );
}
