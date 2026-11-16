import Link from "next/link";
import { AppealStatusLookup } from "@/components/appeal-status-lookup";

export const metadata = {
  title: "申诉进度查询",
  robots: { index: false, follow: false },
};

export default async function AppealStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const params = await searchParams;
  const appealId = (params.id ?? "").slice(0, 64);

  return (
    <article className="mx-auto max-w-2xl pb-16 pt-12">
      <Link
        href="/appeal"
        className="text-xs text-muted underline underline-offset-4 transition hover:text-ink"
      >
        ← 返回申诉页
      </Link>

      <header className="mt-7 border-b border-line pb-6">
        <p className="font-mono text-[10px] tracking-[0.2em] text-accent">
          申诉进度 / STATUS
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
          看看处理到哪一步
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-7 text-muted">
          输入受理编号和提交时填写的联系方式。这里只展示状态流水和对外公示说明，
          不展示内部备注、证据链接和你的联系方式。
        </p>
      </header>

      <AppealStatusLookup defaultId={appealId} />

      <section className="mt-10 border-t border-line pt-6">
        <h2 className="font-serif text-lg font-semibold">状态说明</h2>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-muted">
          <li>
            <span className="text-ink">待处理</span>：已收到，尚未开始核对。
          </li>
          <li>
            <span className="text-ink">处理中</span>：正在核对材料和公开来源。
          </li>
          <li>
            <span className="text-ink">已更正</span>：记录已作废、补充说明或登记公示。
          </li>
          <li>
            <span className="text-ink">已拒绝</span>：材料不足或与公开记录不符，保留原记录。
          </li>
        </ul>
      </section>
    </article>
  );
}
