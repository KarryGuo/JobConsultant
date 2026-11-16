import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE, revokeAdminSession } from "@/lib/admin-auth";

export async function POST() {
  const store = await cookies();
  const value = store.get(ADMIN_COOKIE)?.value;

  if (value) {
    try {
      await revokeAdminSession(value);
    } catch (error) {
      // 吊销失败也要清 Cookie，但保留日志便于排查。
      console.error("admin session revoke failed", error);
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
