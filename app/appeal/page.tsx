import Link from "next/link";
import { AppealForm } from "@/components/appeal-form";

export const metadata = {
  title: "企业申诉与更正",
};

export default async function AppealPage({
  searchParams,
}: {
  searchParams: Promise<{
    company?: string;
    companyId?: string;
    report?: string;
    signal?: string;
  }>;
}) {
  const params = await searchParams;
  const companyName = (params.company ?? "").slice(0, 100);
  const companyId = (params.companyId ?? "").slice(0, 64);
  const reportId = (params.report ?? "").slice(0, 64);
  const signalId = (params.signal ?? "").slice(0, 64);

  return (
    <article className="mx-auto max-w-2xl pb-16 pt-12">
      <Link
        href={companyId ? `/company/${companyId}` : "/"}
        className="text-xs text-muted underline underline-offset-4 transition hover:text-ink"
      >
        ← {companyId ? "返回原报告" : "返回首页"}
      </Link>

      <header className="mt-7 border-b border-line pb-6">
        <p className="font-mono text-[10px] tracking-[0.2em] text-accent">
          企业申诉 / CORRECTION
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
          认为记录有误？
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-7 text-muted">
          如果金额、人数、日期、主体或案件状态有误，或者记录已经履行、整改、撤销，可以在这里提交反证。
          我们只更正事实，不删除事实。
        </p>
        <p className="mt-4 text-sm">
          <Link
            href="/appeal/status"
            className="text-accent underline underline-offset-4"
          >
            已有受理编号？查询处理进度 →
          </Link>
        </p>
      </header>

      <div className="mt-8">
        <AppealForm
          defaultCompanyName={companyName}
          defaultCompanyId={companyId}
          defaultReportId={reportId}
          defaultSignalId={signalId}
        />
      </div>

      <section className="mt-12 border-t border-line pt-6">
        <h2 className="font-serif text-lg font-semibold">处理原则</h2>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-muted">
          <li>只接受可核验的材料：官方文书、履行凭证、整改/撤销证明、主体证明。</li>
          <li>
            不会因为一封申诉直接删除记录。核对后会在报告中标注更正、补充背景，或维持原记录。
          </li>
          <li>联系方式只用于本次核对，不会公开，也不会用于营销。</li>
          <li>当前为人工处理；恶意申诉或批量骚扰会被拒绝。</li>
        </ul>
      </section>
    </article>
  );
}
