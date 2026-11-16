"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { APPEAL_STATUSES, APPEAL_STATUS_LABELS } from "@/lib/appeal";

export function AdminAppealStatusForm({
  appealId,
  initialStatus,
  initialNote,
}: {
  appealId: string;
  initialStatus: string;
  initialNote: string;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [note, setNote] = useState(initialNote);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setSaved(false);
    setError(false);

    try {
      const response = await fetch(`/api/admin/appeals/${appealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, internalNote: note }),
      });

      if (response.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-10 border-t border-line pt-6">
      <h2 className="font-serif text-lg font-semibold">处理结果</h2>
      <p className="mt-1 text-xs text-muted">
        状态和备注只对内部可见，不会展示给企业或前台用户。
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-[180px_1fr]">
        <div>
          <label htmlFor="appeal-status" className="text-sm font-medium">
            状态
          </label>
          <select
            id="appeal-status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setSaved(false);
            }}
            className="mt-2 h-11 w-full border border-line bg-white px-3 text-sm outline-none transition focus:border-ink/50"
          >
            {APPEAL_STATUSES.map((value) => (
              <option key={value} value={value}>
                {APPEAL_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="appeal-note" className="text-sm font-medium">
            内部备注
          </label>
          <textarea
            id="appeal-note"
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
              setSaved(false);
            }}
            maxLength={2000}
            rows={4}
            placeholder="记录核对结果、联系情况、是否需要补充材料等。"
            className="mt-2 w-full resize-y border border-line bg-white px-3 py-3 text-sm leading-6 outline-none transition focus:border-ink/50"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="h-11 bg-ink px-5 text-sm text-paper transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "保存中…" : "保存处理结果"}
        </button>
        {saved ? (
          <span className="text-xs text-accent" role="status">
            已保存
          </span>
        ) : null}
        {error ? (
          <span className="text-xs text-accent" role="alert">
            保存失败，请重试
          </span>
        ) : null}
      </div>
    </form>
  );
}
