import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  clientKey,
  createRateLimiter,
  retryAfterSeconds,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

// 查询需要同时匹配编号与联系方式，限制单 IP 每 10 分钟 20 次。
const limiter = createRateLimiter({ limit: 20, windowMs: 10 * 60 * 1000 });

const InputSchema = z.object({
  id: z.string().trim().min(10).max(64),
  contact: z.string().trim().min(5).max(200),
});

/**
 * 申诉进度查询：受理编号 + 提交时的联系方式，两者同时匹配才返回。
 * 只返回状态流水与公示说明，不返回内部备注、证据链接和联系方式。
 */
export async function POST(request: NextRequest) {
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

  const appeal = await prisma.appealRequest.findFirst({
    where: {
      id: parsed.data.id,
      contact: parsed.data.contact,
    },
    select: {
      companyName: true,
      category: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      handledAt: true,
      publicNote: true,
      events: {
        orderBy: { createdAt: "asc" },
        select: {
          type: true,
          fromStatus: true,
          toStatus: true,
          createdAt: true,
        },
      },
    },
  });

  if (!appeal) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, appeal });
}
