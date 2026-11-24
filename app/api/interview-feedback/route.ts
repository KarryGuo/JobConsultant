import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { readEnv } from "@/lib/env";
import {
  clientKey,
  createRateLimiter,
  retryAfterSeconds,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

// 匿名反馈最多每小时 20 份；匿名标识可被清除，仍需按 IP 兜底。
const limiter = createRateLimiter({ limit: 20, windowMs: 60 * 60 * 1000 });

const InputSchema = z.object({
  companyId: z.string().min(1),
  roundsBand: z.enum(["1-3", "4-6", "7+"]),
  daysToResultBand: z.enum([
    "within_1_week",
    "2_4_weeks",
    "1_2_months",
    "longer",
    "no_result",
  ]),
  askedPrivacy: z.enum(["yes", "no", "decline"]),
  testTaskBand: z.enum(["none", "within_2h", "over_2h"]),
  rejectionBand: z.enum(["with_reason", "without_reason", "none"]),
  anonymousKey: z.string().min(8).max(128),
});

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

export async function POST(request: NextRequest) {
  const limit = limiter.check(clientKey(request));
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "too many requests" },
      {
        status: 429,
        headers: { "Retry-After": retryAfterSeconds(limit) },
      },
    );
  }

  const salt = readEnv("ANON_SALT");
  if (!salt) {
    console.error("ANON_SALT is not configured");
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
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

  const {
    companyId,
    roundsBand,
    daysToResultBand,
    askedPrivacy,
    testTaskBand,
    rejectionBand,
    anonymousKey,
  } = parsed.data;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true },
  });

  if (!company) {
    return NextResponse.json({ error: "company not found" }, { status: 404 });
  }

  // 只存加盐哈希，不存浏览器里的原始随机标识。
  const hashedKey = createHash("sha256")
    .update(`${salt}:${anonymousKey}`)
    .digest("hex");

  try {
    await prisma.interviewFeedback.create({
      data: {
        companyId,
        roundsBand,
        daysToResultBand,
        askedPrivacy,
        testTaskBand,
        rejectionBand,
        anonymousKey: hashedKey,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return NextResponse.json(
        { error: "already submitted" },
        { status: 409 },
      );
    }
    console.error("interview feedback failed", error);
    return NextResponse.json({ error: "submit failed" }, { status: 500 });
  }
}
