import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  clientKey,
  createRateLimiter,
  retryAfterSeconds,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

// 同一 IP 每小时最多 5 条；联系方式维度另有 3 条/小时的限制。
const limiter = createRateLimiter({ limit: 5, windowMs: 60 * 60 * 1000 });

const HttpUrl = z
  .string()
  .trim()
  .max(500)
  .refine((value) => /^https?:\/\//i.test(value), {
    message: "evidenceUrl must be http(s)",
  });

const InputSchema = z.object({
  companyName: z.string().trim().min(2).max(100),
  companyId: z.string().trim().max(64).optional().default(""),
  reportId: z.string().trim().max(64).optional().default(""),
  signalId: z.string().trim().max(64).optional().default(""),
  category: z.enum([
    "fact_error",
    "outdated",
    "missing_context",
    "wrong_company",
    "coverage_request",
    "other",
  ]),
  details: z.string().trim().min(20).max(2000),
  evidenceUrl: z.union([HttpUrl, z.literal("")]).optional(),
  contact: z.string().trim().min(5).max(200),
  // 蜜罐字段：正常用户看不到，机器人往往会填。
  website: z.string().max(200).optional().default(""),
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

  const input = parsed.data;

  if (input.website) {
    // 对机器人返回成功，避免它继续试探。
    return NextResponse.json({ ok: true });
  }

  // 同一联系方式一小时内最多 3 次，先挡住最基本的重复提交。
  // 生产环境应再叠加 IP / 设备维度的限流。
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  try {
    const recent = await prisma.appealRequest.count({
      where: {
        contact: input.contact,
        createdAt: { gte: oneHourAgo },
      },
    });

    if (recent >= 3) {
      return NextResponse.json(
        { error: "too many requests" },
        { status: 429 },
      );
    }

    const appeal = await prisma.appealRequest.create({
      data: {
        companyId: input.companyId || null,
        companyName: input.companyName,
        reportId: input.reportId || null,
        signalId: input.signalId || null,
        category: input.category,
        details: input.details,
        evidenceUrl: input.evidenceUrl || null,
        contact: input.contact,
        events: {
          create: {
            type: "created",
            toStatus: "open",
          },
        },
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, id: appeal.id });
  } catch (error) {
    console.error("appeal submit failed", error);
    return NextResponse.json({ error: "submit failed" }, { status: 500 });
  }
}
