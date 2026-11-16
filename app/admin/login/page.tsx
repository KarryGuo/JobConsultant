import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin-login-form";
import { adminConfigured, isAdmin } from "@/lib/admin-auth";

export const metadata = {
  title: "后台登录",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  if (await isAdmin()) redirect("/admin");

  const configured = adminConfigured();

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center bg-ink font-serif text-sm leading-none text-paper">
            档
          </span>
          <span className="font-serif text-lg font-semibold tracking-tight">
            职顾问
          </span>
          <span className="border-l border-line pl-2.5 font-mono text-[9px] tracking-[0.18em] text-accent">
            ADMIN
          </span>
        </div>

        <h1 className="mt-10 font-serif text-3xl font-semibold tracking-tight">
          申诉处理
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          仅限内部使用。登录后可查看企业申诉、更新处理状态和内部备注。
        </p>

        {configured ? (
          <AdminLoginForm />
        ) : (
          <div className="mt-7 border-y border-line py-5 text-sm leading-6 text-muted">
            后台未配置。请在{" "}
            <code className="font-mono text-ink">.env</code> 中设置{" "}
            <code className="font-mono text-ink">ADMIN_PASSWORD</code> 和{" "}
            <code className="font-mono text-ink">ADMIN_SESSION_SECRET</code>{" "}
            后重启。
          </div>
        )}

        <Link
          href="/"
          className="mt-8 inline-flex text-xs text-muted underline underline-offset-4 transition hover:text-ink"
        >
          ← 返回前台
        </Link>
      </div>
    </div>
  );
}
