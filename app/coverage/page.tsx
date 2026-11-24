import type { Metadata } from "next";
import Link from "next/link";
import { CoverageRequestForm } from "@/components/coverage-request-form";
import {
  COVERED_REGIONS,
  DIRECT_LOOKUP_ONLY_REGIONS,
  PENDING_REGIONS,
} from "@/lib/coverage";

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

      <section className="mt-10 border-t border-line pt-6">
        <p className="font-mono text-[10px] tracking-[0.2em] text-accent">
          覆盖地图 / 持续更新
        </p>
        <h2 className="mt-2 font-serif text-2xl font-semibold tracking-tight">
          全国覆盖进度
        </h2>
        <p className="mt-3 text-sm leading-7 text-muted">
          已接入 {COVERED_REGIONS.length} 个省级行政区的人社公告自动采集；
          其余省份按批次推进，未接入前仍可在企业页使用官方直查入口。
        </p>

        <div className="mt-5 space-y-5 text-xs">
          <div>
            <p className="font-mono text-[10px] tracking-[0.16em] text-accent">
              已接入自动采集 · {COVERED_REGIONS.length}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {COVERED_REGIONS.map((region) => (
                <span
                  key={region}
                  className="border border-accent/50 px-2 py-1 text-accent"
                >
                  {region}
                </span>
              ))}
            </div>
          </div>

          {PENDING_REGIONS.length > 0 && (
            <div>
              <p className="font-mono text-[10px] tracking-[0.16em] text-muted">
                待接入 · {PENDING_REGIONS.length}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {PENDING_REGIONS.map((region) => (
                  <span
                    key={region}
                    className="border border-line px-2 py-1 text-muted"
                  >
                    {region}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="font-mono text-[10px] tracking-[0.16em] text-muted">
              站点限制自动访问，仅提供官方直查 · {DIRECT_LOOKUP_ONLY_REGIONS.length}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {DIRECT_LOOKUP_ONLY_REGIONS.map((region) => (
                <span
                  key={region}
                  className="border border-line px-2 py-1 text-muted"
                >
                  {region}
                </span>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-4 text-xs leading-6 text-muted">
          覆盖范围持续复核；没有记录不代表没有风险。
        </p>
      </section>

      <div className="mt-8 border-t-2 border-ink pt-5">
        <CoverageRequestForm defaultCompanyName="" />
      </div>
    </div>
  );
}
