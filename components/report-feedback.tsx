"use client";

import { useState } from "react";

const SKIP_REASONS = [
  "薪资不合适",
  "岗位不匹配",
  "通勤太远",
  "已有其他 offer",
  "风险太高",
  "其他",
];

type Status = "idle" | "reason" | "sending" | "done" | "error";

export function ReportFeedback({ reportId }: { reportId: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [reason, setReason] = useState(SKIP_REASONS[0]);

  async function submit(action: "applied" | "skipped", selectedReason?: string) {
    setStatus("sending");
    try {
      const response = await fetch("/api/report-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, action, reason: selectedReason }),
      });
      setStatus(response.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <p className="text-sm text-muted" role="status">
        已记录，谢谢。你的选择只用于改进报告，不关联账号。
      </p>
    );
  }

  return (
    <div>
      <p className="font-serif text-xl font-semibold">看完这份报告，你会怎么选？</p>
      <p className="mt-1 text-xs leading-5 text-muted">
        匿名记录，不关联账号。样本只做聚合统计。
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={status === "sending"}
          onClick={() => submit("applied")}
          className="h-11 border border-ink bg-ink px-4 text-sm text-paper transition hover:bg-accent disabled:opacity-50"
        >
          我投了
        </button>
        <button
          type="button"
          disabled={status === "sending"}
          onClick={() => setStatus("reason")}
          className="h-11 border border-line bg-white px-4 text-sm text-ink transition hover:border-ink/40 disabled:opacity-50"
        >
          我放弃了
        </button>
      </div>

      {status === "reason" ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor="skip-reason" className="text-xs text-muted">
            原因
          </label>
          <select
            id="skip-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="h-9 border border-line bg-white px-2 text-sm outline-none focus:border-ink/50"
          >
            {SKIP_REASONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => submit("skipped", reason)}
            className="h-9 bg-ink px-3 text-xs text-paper transition hover:bg-accent disabled:opacity-50"
          >
            提交
          </button>
        </div>
      ) : null}

      {status === "error" ? (
        <p className="mt-2 text-xs text-muted" role="alert">
          提交失败，请稍后再试。
        </p>
      ) : null}
    </div>
  );
}
