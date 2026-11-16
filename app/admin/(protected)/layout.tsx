import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminLogoutButton } from "@/components/admin-logout-button";
import { getAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-t-2 border-ink border-b border-line bg-paper/90">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-5">
          <Link href="/admin" className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center bg-ink font-serif text-[12px] leading-none text-paper">
              档
            </span>
            <span className="font-serif text-base font-semibold tracking-tight">
              职顾问
            </span>
            <span className="border-l border-line pl-2.5 font-mono text-[9px] tracking-[0.18em] text-accent">
              申诉处理 / ADMIN
            </span>
          </Link>

          <div className="flex items-center gap-4 text-xs text-muted">
            <span className="hidden font-mono text-[10px] sm:inline">
              处理人 {session.actor}
            </span>
            <Link href="/admin/sources" className="transition hover:text-ink">
              来源健康
            </Link>
            <Link href="/admin/reviews" className="transition hover:text-ink">
              复核队列
            </Link>
            <Link href="/" className="transition hover:text-ink">
              查看前台
            </Link>
            <AdminLogoutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-8">{children}</main>
    </div>
  );
}
