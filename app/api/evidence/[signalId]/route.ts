import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  clientKey,
  createRateLimiter,
  retryAfterSeconds,
} from "@/lib/rate-limit";
import { readSnapshotText } from "@/lib/snapshot";

export const runtime = "nodejs";

// 官方公告快照是公开数据，但仍限制单 IP 抓取频率。
const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ signalId: string }> },
) {
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

  const { signalId } = await params;

  const signal = await prisma.signal.findUnique({
    where: { id: signalId },
    select: {
      id: true,
      sourceTitle: true,
      snapshotHash: true,
      snapshotPath: true,
      invalidatedAt: true,
    },
  });

  if (!signal) {
    return NextResponse.json({ error: "signal not found" }, { status: 404 });
  }

  if (signal.invalidatedAt) {
    return NextResponse.json(
      { error: "signal invalidated" },
      { status: 410 },
    );
  }

  const text = await readSnapshotText(signal.snapshotPath);

  if (!text) {
    return NextResponse.json(
      { error: "snapshot not available" },
      { status: 404 },
    );
  }

  return new NextResponse(text, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `inline; filename="snapshot-${signal.id}.txt"`,
      "Cache-Control": "public, max-age=3600",
      "X-Snapshot-SHA256": signal.snapshotHash,
    },
  });
}
