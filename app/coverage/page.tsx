import type { Metadata } from "next";
import Link from "next/link";
import { CoverageRequestForm } from "@/components/coverage-request-form";

export const metadata: Metadata = {
  title: "提交收录请求",
  description:
    "没有查到想了解的公司？提交收录请求，我们会先寻找可核验的官方来源，再决定是否展示记录。",
  alternates: { canonical: "/coverage" },
};

export default function CoveragePage() {
  return (
    <div className="mx-auto max-w-2xl pb-20 pt-12">
      <Link
        href="/"
        className="text-xs text-muted underline underline-offset-4 transition hover:text-ink"
      >
        ← 返回首页
      </Link>

      <p className="mt-7 font-mono text-[10px] tracking-[0.2em] text-accent">
        收录请求 / COVERAGE REQUEST
      </p>
      <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
        请我们收录一家公司
      </h1>
      <p className="mt-4 text-sm leading-7 text-muted">
        职顾问不是全国企业库。我们会优先补充有稳定官方来源、且求职者真正需要的公司。
        提交后进入后台收录队列；找到可核验来源后再展示记录。
      </p>
      <p className="mt-2 text-sm leading-7 text-muted">
        提交本身不会产生任何风险结论，也不代表这家公司有问题。
      </p>

      <div className="mt-8 border-t-2 border-ink pt-5">
        <CoverageRequestForm defaultCompanyName="" />
      </div>
    </div>
  );
}
