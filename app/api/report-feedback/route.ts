import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  clientKey,
  createRateLimiter,
  retryAfterSeconds,
} from "@/lib/rate-limit";

// 决策反馈是轻量投票，限制单 IP 每小时 30 次。
const limiter = createRateLimiter({ limit: 30, windowMs: 60 * 60 * 1000 });

const SKIP_REASONS = new Set([
  "薪资不合适",
  "岗位不匹配",
  "通勤太远",
  "已有其他 offer",
  "风险太高",
  "其他",
]);

const InputSchema = z.object({
  reportId: z.string().min(1),
  action: z.enum(["applied", "skipped"]),
  reason: z.string().optional(),
});

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

  const { reportId, action, reason } = parsed.data;

  if (action === "skipped" && (!reason || !SKIP_REASONS.has(reason))) {
    return NextResponse.json({ error: "invalid reason" }, { status: 400 });
  }

  const report = await prisma.report.findUnique({
    where: { id: reportId },
    select: { id: true },
  });

  if (!report) {
    return NextResponse.json({ error: "report not found" }, { status: 404 });
  }

  await prisma.reportFeedback.create({
    data: {
      reportId,
      action,
      reason: action === "skipped" ? reason : null,
    },
  });

  return NextResponse.json({ ok: true });
}
