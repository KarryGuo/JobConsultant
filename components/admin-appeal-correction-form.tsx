"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type SignalOption = { id: string; label: string };
type Action = "invalidate" | "annotate" | "none";
type Status = "idle" | "submitting" | "done" | "error";

export function AdminAppealCorrectionForm({
  appealId,
  signals,
  defaultSignalId = "",
  defaultPublicNote = "",
}: {
  appealId: string;
  signals: SignalOption[];
  defaultSignalId?: string;
  defaultPublicNote?: string;
}) {
  const router = useRouter();
  const hasSignals = signals.length > 0;
  const initialSignal =
    defaultSignalId && signals.some((signal) => signal.id === defaultSignalId)
      ? defaultSignalId
      : (signals[0]?.id ?? "");

  const [signalId, setSignalId] = useState(initialSignal);
  const [action, setAction] = useState<Action>(hasSignals ? "annotate" : "none");
  const [note, setNote] = useState("");
  const [publicNote, setPublicNote] = useState(defaultPublicNote);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  // 作废成功后该记录会从可选项中消失，这里始终回落到当前仍有效的信号。
  const selectedSignalId = signals.some((signal) => signal.id === signalId)
    ? signalId
    : (signals[0]?.id ?? "");

  const effectiveAction: Action =
    hasSignals && selectedSignalId ? action : "none";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;

    if (effectiveAction !== "none" && note.trim().length < 5) {
      setStatus("error");
      setMessage("请填写至少 5 个字的更正说明。");
      return;
    }
    if (effectiveAction === "none" && publicNote.trim().length < 5) {
      setStatus("error");
      setMessage("不修改具体记录时，需要填写至少 5 个字的公示说明。");
      return;
    }

    setStatus("submitting");
    setMessage("");

    try {
      const response = await fetch(
        `/api/admin/appeals/${appealId}/correction`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signalId: effectiveAction === "none" ? "" : selectedSignalId,
            action: effectiveAction,
            note,
            publicNote,
          }),
        },
      );

      if (!response.ok) {
        setStatus("error");
        setMessage(
          response.status === 409
            ? "这条记录已经作废过，请刷新后再试。"
            : "保存失败，请检查填写内容。",
        );
        return;
      }

      setStatus("done");
      setMessage("已应用更正并办结。报告会在下次访问时重新生成。");
      setNote("");
      router.refresh();
    } catch {
      setStatus("error");
      setMessage("网络异常，请稍后再试。");
    }
  }

  return (
    <section className="mt-8 border-t-2 border-ink pt-5">
      <p className="font-mono text-[10px] tracking-[0.2em] text-accent">
        更正落地 / CORRECTION
      </p>
      <h2 className="mt-1 font-serif text-lg font-semibold">
        把处理结果写进数据
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        作废的记录会从报告、时间线和证据中移除；追加说明会保留原记录。
        应用后申诉自动办结，并生成新的报告缓存。
      </p>

      <form onSubmit={submit} className="mt-5 space-y-5">
        {hasSignals ? (
          <div>
            <label
              htmlFor="correction-signal"
              className="text-sm font-medium"
            >
              目标记录
            </label>
            <select
              id="correction-signal"
              value={selectedSignalId}
              onChange={(event) => setSignalId(event.target.value)}
              className="mt-2 h-11 w-full border border-line bg-white px-3 text-sm outline-none transition focus:border-ink/50"
            >
              {signals.map((signal) => (
                <option key={signal.id} value={signal.id}>
                  {signal.label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <p className="border border-line bg-white px-3 py-2 text-sm text-muted">
            这条申诉没有关联到具体企业或记录，只能登记公示说明并办结。
          </p>
        )}

        {hasSignals ? (
          <div>
            <label
              htmlFor="correction-action"
              className="text-sm font-medium"
            >
              处理方式
            </label>
            <select
              id="correction-action"
              value={action}
              onChange={(event) => setAction(event.target.value as Action)}
              className="mt-2 h-11 w-full border border-line bg-white px-3 text-sm outline-none transition focus:border-ink/50"
            >
              <option value="annotate">保留记录，追加更正说明</option>
              <option value="invalidate">作废这条记录</option>
              <option value="none">不修改具体记录，仅登记公示说明</option>
            </select>
          </div>
        ) : null}

        {effectiveAction !== "none" ? (
          <div>
            <label htmlFor="correction-note" className="text-sm font-medium">
              更正说明（内部）
            </label>
            <textarea
              id="correction-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              maxLength={500}
              placeholder="写清依据和更正内容，例如：企业提供支付凭证，欠薪已于 2026-10 结清。"
              className="mt-2 w-full resize-y border border-line bg-white px-3 py-3 text-sm leading-6 outline-none transition focus:border-ink/50"
            />
          </div>
        ) : null}

        <div>
          <label
            htmlFor="correction-public-note"
            className="text-sm font-medium"
          >
            公示说明（对外可见，可选）
          </label>
          <textarea
            id="correction-public-note"
            value={publicNote}
            onChange={(event) => setPublicNote(event.target.value)}
            rows={3}
            maxLength={500}
            placeholder="例如：经核对，该笔欠薪已于 2026 年 10 月结清，原记录不再作为风险提示。"
            className="mt-2 w-full resize-y border border-line bg-white px-3 py-3 text-sm leading-6 outline-none transition focus:border-ink/50"
          />
          <p className="mt-1 text-[11px] leading-5 text-muted">
            会显示在公司报告页的「更正记录」中，只写事实，不写内部判断。
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          {message ? (
            <p
              className={`text-sm ${
                status === "error" ? "text-accent" : "text-muted"
              }`}
              role="status"
              aria-live="polite"
            >
              {message}
            </p>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={status === "submitting"}
            className="h-11 bg-ink px-5 text-sm text-paper transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "submitting" ? "应用中…" : "应用更正并办结"}
          </button>
        </div>
      </form>
    </section>
  );
}
