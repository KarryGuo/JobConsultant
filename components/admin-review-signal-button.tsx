"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Status = "idle" | "submitting" | "error";

export function AdminReviewSignalButton({ signalId }: { signalId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function submit() {
    if (status === "submitting") return;

    setStatus("submitting");
    setMessage("");

    try {
      const response = await fetch(`/api/admin/signals/${signalId}/review`, {
        method: "POST",
      });

      if (!response.ok) {
        setStatus("error");
        setMessage("保存失败");
        return;
      }

      router.refresh();
    } catch {
      setStatus("error");
      setMessage("网络异常");
    }
  }

  return (
    <div className="flex items-center gap-2 lg:justify-end">
      <button
        type="button"
        onClick={submit}
        disabled={status === "submitting"}
        className="h-8 border border-line bg-white px-2.5 font-mono text-[10px] text-muted transition hover:border-ink/40 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === "submitting" ? "保存中…" : "标记已复核"}
      </button>
      {message ? (
        <span className="font-mono text-[10px] text-accent" role="status">
          {message}
        </span>
      ) : null}
    </div>
  );
}
