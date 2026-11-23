"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

/**
 * 未收录企业的收录请求。复用申诉接口与后台队列，
 * 分类为 coverage_request，不产生任何风险结论。
 */
export function CoverageRequestForm({
  defaultCompanyName,
}: {
  defaultCompanyName: string;
}) {
  const [companyName, setCompanyName] = useState(defaultCompanyName);
  const [city, setCity] = useState("");
  const [industry, setIndustry] = useState("");
  const [contact, setContact] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");
  const [receipt, setReceipt] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "sending") return;

    setStatus("sending");
    setMessage("");

    const details = `请求收录企业：${companyName}${
      city ? `；城市：${city}` : ""
    }${industry ? `；行业：${industry}` : ""}。希望后续能查询该企业的公开劳动用工与信用记录。`;

    try {
      const response = await fetch("/api/appeal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          companyName,
          category: "coverage_request",
          details,
          contact,
          website,
        }),
      });

      const result = (await response.json().catch(() => null)) as
        | { ok?: boolean; id?: string; error?: string }
        | null;

      if (!response.ok) {
        setStatus("error");
        setMessage(
          response.status === 429
            ? "提交过于频繁，请稍后再试。"
            : "提交失败，请检查公司名和联系方式后重试。",
        );
        return;
      }

      setStatus("done");
      setReceipt(result?.id ?? "");
      setMessage("已进入收录队列。我们不会因为提交就给出结论；补充来源后再展示。");
    } catch {
      setStatus("error");
      setMessage("网络异常，请稍后重试。");
    }
  }

  if (status === "done") {
    return (
      <div className="mt-4 border border-line bg-white/70 px-4 py-4">
        <p className="text-sm font-medium">收录请求已提交</p>
        <p className="mt-2 text-xs leading-6 text-muted">{message}</p>
        {receipt ? (
          <p className="mt-2 font-mono text-[10px] text-muted">
            受理编号 {receipt}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-4 text-xs">
          <Link
            href="/appeal/status"
            className="text-accent underline underline-offset-4"
          >
            查询处理进度 →
          </Link>
          <Link
            href="/companies"
            className="text-muted underline underline-offset-4"
          >
            查看已收录企业 →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="font-mono text-[10px] text-muted">
            公司名称（必填）
          </span>
          <input
            required
            minLength={2}
            maxLength={100}
            value={companyName}
            onChange={(event) => setCompanyName(event.target.value)}
            className="mt-1 w-full border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-ink/50"
          />
        </label>
        <label className="block">
          <span className="font-mono text-[10px] text-muted">
            城市（选填）
          </span>
          <input
            maxLength={40}
            value={city}
            onChange={(event) => setCity(event.target.value)}
            placeholder="例如 深圳市"
            className="mt-1 w-full border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-ink/50"
          />
        </label>
        <label className="block">
          <span className="font-mono text-[10px] text-muted">
            行业（选填）
          </span>
          <input
            maxLength={40}
            value={industry}
            onChange={(event) => setIndustry(event.target.value)}
            placeholder="例如 互联网"
            className="mt-1 w-full border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-ink/50"
          />
        </label>
        <label className="block">
          <span className="font-mono text-[10px] text-muted">
            联系方式（必填，便于收录后通知）
          </span>
          <input
            required
            minLength={5}
            maxLength={200}
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            placeholder="邮箱或手机号"
            className="mt-1 w-full border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-ink/50"
          />
        </label>
      </div>

      {/* 蜜罐字段，正常用户不可见 */}
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        value={website}
        onChange={(event) => setWebsite(event.target.value)}
        className="hidden"
        aria-hidden="true"
      />

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={status === "sending"}
          className="inline-flex h-10 items-center bg-ink px-5 text-sm font-medium text-paper transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "sending" ? "提交中…" : "提交收录请求"}
        </button>
        <p className="text-xs text-muted">
          只登记公司名与联系方式，不会自动生成任何风险结论。
        </p>
      </div>

      {status === "error" ? (
        <p className="text-xs text-accent">{message}</p>
      ) : null}
    </form>
  );
}
