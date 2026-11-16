"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { sourceHealthLabel } from "@/lib/source-health";

type Status = "idle" | "checking" | "error";

export function AdminSourceCheckButton({ sourceId }: { sourceId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState("");

  async function check() {
    if (status === "checking") return;

    setStatus("checking");
    setResult("");

    try {
      const response = await fetch(`/api/admin/sources/${sourceId}/check`, {
        method: "POST",
      });

      if (!response.ok) {
        setStatus("error");
        setResult("检查失败");
        return;
      }

      const data = (await response.json()) as { status?: string };
      setStatus("idle");
      setResult(data.status ? sourceHealthLabel(data.status) : "已检查");
      router.refresh();
    } catch {
      setStatus("error");
      setResult("网络异常");
    }
  }

  return (
    <div className="flex items-center gap-2 sm:justify-end">
      <button
        type="button"
        onClick={check}
        disabled={status === "checking"}
        className="h-8 border border-line bg-white px-2.5 font-mono text-[10px] text-muted transition hover:border-ink/40 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === "checking" ? "检查中…" : "重新检查"}
      </button>
      {result ? (
        <span
          className={`font-mono text-[10px] ${
            status === "error" ? "text-accent" : "text-muted"
          }`}
          role="status"
          aria-live="polite"
        >
          {result}
        </span>
      ) : null}
    </div>
  );
}
