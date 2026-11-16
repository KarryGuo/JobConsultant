"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

const CATEGORIES = [
  { value: "fact_error", label: "事实错误（金额、人数、日期等）" },
  { value: "outdated", label: "记录已过时（已履行、已整改、已撤销）" },
  {
    value: "missing_context",
    label: "缺少背景（已复议、已和解、案件已终结）",
  },
  { value: "wrong_company", label: "主体认错（同名、分公司、已注销）" },
  { value: "other", label: "其他" },
] as const;

type Status = "idle" | "submitting" | "done" | "error";

export function AppealForm({
  defaultCompanyName = "",
  defaultCompanyId = "",
  defaultReportId = "",
  defaultSignalId = "",
}: {
  defaultCompanyName?: string;
  defaultCompanyId?: string;
  defaultReportId?: string;
  defaultSignalId?: string;
}) {
  const [companyName, setCompanyName] = useState(defaultCompanyName);
  const [category, setCategory] = useState<string>(CATEGORIES[0].value);
  const [details, setDetails] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [contact, setContact] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [receipt, setReceipt] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;

    setStatus("submitting");

    try {
      const response = await fetch("/api/appeal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName,
          companyId: defaultCompanyId,
          reportId: defaultReportId,
          signalId: defaultSignalId,
          category,
          details,
          evidenceUrl,
          contact,
          website,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | { ok?: boolean; id?: string }
        | null;

      if (response.ok && data?.ok) {
        setReceipt(typeof data.id === "string" ? data.id : null);
        setStatus("done");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div className="border-y border-line py-8">
        <p className="font-mono text-[10px] tracking-[0.2em] text-accent">
          已收到 / RECEIVED
        </p>
        <h2 className="mt-3 font-serif text-2xl font-semibold">
          申诉已记录。
        </h2>
        {receipt ? (
          <p className="mt-3 text-sm text-muted">
            受理编号：
            <span className="font-mono text-ink">{receipt}</span>
          </p>
        ) : null}
        <p className="mt-3 max-w-xl text-sm leading-7 text-muted">
          我们不会因为一封申诉直接删除记录。核对后会在报告中标注更正、补充背景，或维持原记录。
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          {receipt ? (
            <Link
              href={`/appeal/status?id=${encodeURIComponent(receipt)}`}
              className="inline-flex h-10 items-center bg-ink px-4 text-sm text-paper transition hover:bg-accent"
            >
              查询处理进度
            </Link>
          ) : null}
          {defaultCompanyId ? (
            <Link
              href={`/company/${defaultCompanyId}`}
              className="inline-flex h-10 items-center border border-line bg-white px-4 text-sm transition hover:border-ink/40"
            >
              返回原报告
            </Link>
          ) : null}
          <Link
            href="/companies"
            className="inline-flex h-10 items-center border border-line bg-white px-4 text-sm transition hover:border-ink/40"
          >
            查看企业索引
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="relative space-y-7">
      <div>
        <label htmlFor="appeal-company" className="text-sm font-medium">
          公司名称
        </label>
        <input
          id="appeal-company"
          name="companyName"
          value={companyName}
          onChange={(event) => setCompanyName(event.target.value)}
          required
          minLength={2}
          maxLength={100}
          placeholder="请填写公司全称"
          className="mt-2 h-11 w-full border border-line bg-white px-3 text-sm outline-none transition focus:border-ink/50"
        />
      </div>

      <div>
        <label htmlFor="appeal-category" className="text-sm font-medium">
          问题类型
        </label>
        <select
          id="appeal-category"
          name="category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="mt-2 h-11 w-full border border-line bg-white px-3 text-sm outline-none transition focus:border-ink/50"
        >
          {CATEGORIES.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="appeal-details" className="text-sm font-medium">
          具体说明
        </label>
        <textarea
          id="appeal-details"
          name="details"
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          required
          minLength={20}
          maxLength={2000}
          rows={6}
          placeholder="请写明哪条记录、哪个数字或哪个状态有误，以及希望如何更正。"
          className="mt-2 w-full resize-y border border-line bg-white px-3 py-3 text-sm leading-6 outline-none transition focus:border-ink/50"
        />
        <p className="mt-1 text-[11px] leading-5 text-muted">
          至少 20 字。请尽量给出可核验的时间、文号或链接。
        </p>
      </div>

      <div>
        <label htmlFor="appeal-evidence" className="text-sm font-medium">
          反证链接（可选）
        </label>
        <input
          id="appeal-evidence"
          name="evidenceUrl"
          type="url"
          value={evidenceUrl}
          onChange={(event) => setEvidenceUrl(event.target.value)}
          maxLength={500}
          placeholder="https://..."
          className="mt-2 h-11 w-full border border-line bg-white px-3 text-sm outline-none transition focus:border-ink/50"
        />
        <p className="mt-1 text-[11px] leading-5 text-muted">
          官方文书、履行凭证、整改/撤销证明、主体证明等。请勿提交含个人隐私的链接。
        </p>
      </div>

      <div>
        <label htmlFor="appeal-contact" className="text-sm font-medium">
          联系方式
        </label>
        <input
          id="appeal-contact"
          name="contact"
          value={contact}
          onChange={(event) => setContact(event.target.value)}
          required
          minLength={5}
          maxLength={200}
          placeholder="邮箱或电话，仅用于本次核对"
          className="mt-2 h-11 w-full border border-line bg-white px-3 text-sm outline-none transition focus:border-ink/50"
        />
        <p className="mt-1 text-[11px] leading-5 text-muted">
          不会公开，也不会用于营销。
        </p>
      </div>

      <div
        aria-hidden="true"
        className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden"
      >
        <label htmlFor="appeal-website">网站</label>
        <input
          id="appeal-website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5">
        <p className="text-[11px] leading-5 text-muted">
          提交即表示你确认以上信息可供核对。
        </p>
        <button
          type="submit"
          disabled={status === "submitting"}
          className="h-11 bg-ink px-5 text-sm text-paper transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "submitting" ? "提交中…" : "提交申诉"}
        </button>
      </div>

      {status === "error" ? (
        <p className="text-sm text-accent" role="alert" aria-live="polite">
          提交失败，请检查必填项后再试。
        </p>
      ) : null}
    </form>
  );
}
