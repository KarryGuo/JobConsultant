"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Status = "idle" | "submitting" | "error";

export function AdminLoginForm() {
  const [actor, setActor] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const router = useRouter();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;

    setStatus("submitting");

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actor, password }),
      });

      if (response.ok) {
        router.replace("/admin");
        router.refresh();
        return;
      }

      setStatus("error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <form onSubmit={submit} className="mt-7">
      <label htmlFor="admin-actor" className="text-sm font-medium">
        处理人
      </label>
      <input
        id="admin-actor"
        name="actor"
        type="text"
        autoComplete="name"
        value={actor}
        onChange={(event) => setActor(event.target.value)}
        required
        maxLength={20}
        placeholder="你的姓名，会写进处理记录"
        className="mt-2 h-11 w-full border border-line bg-white px-3 text-sm outline-none transition focus:border-ink/50"
      />

      <label
        htmlFor="admin-password"
        className="mt-5 block text-sm font-medium"
      >
        后台密码
      </label>
      <input
        id="admin-password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
        className="mt-2 h-11 w-full border border-line bg-white px-3 text-sm outline-none transition focus:border-ink/50"
      />
      <button
        type="submit"
        disabled={status === "submitting"}
        className="mt-4 h-11 w-full bg-ink px-5 text-sm text-paper transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === "submitting" ? "验证中…" : "进入后台"}
      </button>
      {status === "error" ? (
        <p className="mt-3 text-sm text-accent" role="alert" aria-live="polite">
          密码不正确，或尝试次数过多。
        </p>
      ) : null}
    </form>
  );
}
