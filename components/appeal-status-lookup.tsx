"use client";

import { useState, type FormEvent } from "react";
import {
  appealCategoryLabel,
  appealEventLabel,
  appealStatusClass,
  appealStatusLabel,
} from "@/lib/appeal";
import { formatDateTime } from "@/lib/format";

type LookupAppeal = {
  companyName: string;
  category: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  handledAt: string | null;
  publicNote: string | null;
  events: Array<{
    type: string;
    fromStatus: string | null;
    toStatus: string | null;
    createdAt: string;
  }>;
};

type Status = "idle" | "submitting" | "done" | "error";

export function AppealStatusLookup({ defaultId = "" }: { defaultId?: string }) {
  const [id, setId] = useState(defaultId);
  const [contact, setContact] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [appeal, setAppeal] = useState<LookupAppeal | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;

    setStatus("submitting");
    setMessage("");
    setAppeal(null);

    try {
      const response = await fetch("/api/appeal/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, contact }),
      });

      if (response.status === 429) {
        setStatus("error");
        setMessage("查询太频繁，请过几分钟再试。");
        return;
      }

      if (!response.ok) {
        setStatus("error");
        setMessage("没有查到匹配的申诉，请确认受理编号和联系方式是否完全一致。");
        return;
      }

      const data = (await response.json()) as {
        appeal?: LookupAppeal;
      };

      if (!data.appeal) {
        setStatus("error");
        setMessage("没有查到匹配的申诉，请确认受理编号和联系方式是否完全一致。");
        return;
      }

      setAppeal(data.appeal);
      setStatus("done");
    } catch {
      setStatus("error");
      setMessage("网络异常，请稍后再试。");
    }
  }

  return (
    <div>
      <form onSubmit={submit} className="mt-7 space-y-5">
        <div>
          <label htmlFor="appeal-status-id" className="text-sm font-medium">
            受理编号
          </label>
          <input
            id="appeal-status-id"
            name="id"
            value={id}
            onChange={(event) => setId(event.target.value)}
            required
            maxLength={64}
            placeholder="提交申诉时显示的编号"
            className="mt-2 h-11 w-full border border-line bg-white px-3 font-mono text-sm outline-none transition focus:border-ink/50"
          />
        </div>

        <div>
          <label
            htmlFor="appeal-status-contact"
            className="text-sm font-medium"
          >
            联系方式
          </label>
          <input
            id="appeal-status-contact"
            name="contact"
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            required
            minLength={5}
            maxLength={200}
            placeholder="与提交申诉时填写的一致"
            className="mt-2 h-11 w-full border border-line bg-white px-3 text-sm outline-none transition focus:border-ink/50"
          />
          <p className="mt-1 text-[11px] leading-5 text-muted">
            需要同时匹配受理编号和联系方式，避免他人凭编号查看你的申诉。
          </p>
        </div>

        <button
          type="submit"
          disabled={status === "submitting"}
          className="h-11 bg-ink px-5 text-sm text-paper transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "submitting" ? "查询中…" : "查询处理进度"}
        </button>
      </form>

      {message ? (
        <p className="mt-4 text-sm text-accent" role="alert" aria-live="polite">
          {message}
        </p>
      ) : null}

      {appeal ? (
        <section className="mt-8 border-y border-line py-6">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex border px-2 py-0.5 font-mono text-[9px] tracking-wide ${appealStatusClass(
                appeal.status,
              )}`}
            >
              {appealStatusLabel(appeal.status)}
            </span>
            <p className="font-serif text-lg font-medium">
              {appeal.companyName}
            </p>
            <span className="font-mono text-[10px] text-muted">
              {appealCategoryLabel(appeal.category)}
            </span>
          </div>

          <dl className="mt-5 grid gap-3 border-t border-line pt-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted">收到时间</dt>
              <dd className="mt-1 font-mono text-xs">
                {formatDateTime(appeal.createdAt)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">最近更新</dt>
              <dd className="mt-1 font-mono text-xs">
                {formatDateTime(appeal.updatedAt)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted">办结时间</dt>
              <dd className="mt-1 font-mono text-xs">
                {appeal.handledAt ? formatDateTime(appeal.handledAt) : "尚未办结"}
              </dd>
            </div>
          </dl>

          {appeal.publicNote ? (
            <div className="mt-5 border-l-2 border-accent pl-4">
              <p className="font-mono text-[10px] tracking-wide text-accent">
                处理结果公示
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">
                {appeal.publicNote}
              </p>
            </div>
          ) : null}

          <h3 className="mt-6 font-serif text-base font-semibold">处理进度</h3>
          <ol className="mt-3 border-t border-line">
            {appeal.events.map((event, index) => (
              <li
                key={`${event.type}-${event.createdAt}-${index}`}
                className="border-b border-line py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm">{appealEventLabel(event.type)}</p>
                  <time className="font-mono text-[10px] text-muted">
                    {formatDateTime(event.createdAt)}
                  </time>
                </div>
                {event.fromStatus &&
                event.toStatus &&
                event.fromStatus !== event.toStatus ? (
                  <p className="mt-1 font-mono text-[10px] text-muted">
                    {appealStatusLabel(event.fromStatus)} →{" "}
                    {appealStatusLabel(event.toStatus)}
                  </p>
                ) : event.toStatus ? (
                  <p className="mt-1 font-mono text-[10px] text-muted">
                    状态：{appealStatusLabel(event.toStatus)}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
