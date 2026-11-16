import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  ADMIN_ACTOR_PATTERN,
  ADMIN_COOKIE,
  ADMIN_SESSION_MAX_AGE,
  adminConfigured,
  cleanupExpiredAdminSessions,
  createAdminSession,
} from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

type Attempt = { count: number; resetAt: number };
const attempts = new Map<string, Attempt>();

const InputSchema = z.object({
  password: z.string().min(1).max(200),
  actor: z
    .string()
    .trim()
    .regex(ADMIN_ACTOR_PATTERN, "invalid actor"),
});

function passwordMatches(input: string, expected: string): boolean {
  const actual = createHash("sha256").update(input).digest();
  const wanted = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actual, wanted);
}

function attemptFor(ip: string, now: number): Attempt {
  const current = attempts.get(ip);
  if (!current || current.resetAt <= now) {
    return { count: 0, resetAt: now + WINDOW_MS };
  }
  return current;
}

export async function POST(request: NextRequest) {
  if (!adminConfigured()) {
    return NextResponse.json(
      { error: "admin not configured" },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid input" }, { status: 400 });
  }

  const now = Date.now();
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const attempt = attemptFor(ip, now);

  if (attempt.count >= MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: "too many attempts" },
      { status: 429 },
    );
  }

  const expected = process.env.ADMIN_PASSWORD ?? "";
  if (!passwordMatches(parsed.data.password, expected)) {
    attempts.set(ip, {
      count: attempt.count + 1,
      resetAt: attempt.resetAt,
    });
    return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  }

  attempts.delete(ip);

  const session = createAdminSession(parsed.data.actor, now);

  try {
    await prisma.adminSession.create({
      data: {
        nonce: session.nonce,
        actor: session.actor,
        issuedAt: new Date(session.issuedAt),
        expiresAt: session.expiresAt,
      },
    });
  } catch (error) {
    console.error("admin session create failed", error);
    return NextResponse.json(
      { error: "session creation failed" },
      { status: 500 },
    );
  }

  // 顺手清理过期会话，失败不影响本次登录。
  void cleanupExpiredAdminSessions().catch((error) => {
    console.error("admin session cleanup failed", error);
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE,
  });
  return response;
}
