import Link from "next/link";
import { ExampleLinks } from "@/components/example-links";
import { SearchForm } from "@/components/search-form";

export default function NotFound() {
  return (
    <div className="max-w-xl py-20">
      <p className="font-mono text-xs tracking-[0.18em] text-muted">404</p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">
        没有找到这个页面
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        可能是链接过期，也可能是这家公司还没有被收录。直接搜一下公司名试试。
      </p>
      <div className="mt-6">
        <SearchForm size="md" id="not-found-search" emphasis />
      </div>
      <div className="mt-4">
        <ExampleLinks />
      </div>
      <Link
        href="/"
        className="mt-8 inline-flex text-sm text-accent underline underline-offset-4"
      >
        回到首页
      </Link>
    </div>
  );
}
