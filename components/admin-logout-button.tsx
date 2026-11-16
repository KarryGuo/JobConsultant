"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminLogoutButton() {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function logout() {
    if (busy) return;
    setBusy(true);

    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } finally {
      router.replace("/admin/login");
      router.refresh();
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={busy}
      className="text-xs text-muted transition hover:text-ink disabled:opacity-50"
    >
      {busy ? "退出中…" : "退出"}
    </button>
  );
}
