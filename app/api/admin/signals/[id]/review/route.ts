import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";
import { computeNextReviewAt } from "@/lib/freshness";

export const runtime = "nodejs";

/**
 * 标记信号已复核：更新最近核验时间，并按复核周期顺延。
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const signal = await prisma.signal.findUnique({
    where: { id },
    select: {
      id: true,
      reviewCycleDays: true,
      invalidatedAt: true,
    },
  });

  if (!signal) {
    return NextResponse.json({ error: "signal not found" }, { status: 404 });
  }

  if (signal.invalidatedAt) {
    return NextResponse.json(
      { error: "signal already invalidated" },
      { status: 409 },
    );
  }

  const now = new Date();
  const nextReviewAt = computeNextReviewAt(now, signal.reviewCycleDays);

  try {
    const updated = await prisma.signal.update({
      where: { id },
      data: {
        lastVerifiedAt: now,
        nextReviewAt,
      },
      select: {
        id: true,
        lastVerifiedAt: true,
        reviewCycleDays: true,
        nextReviewAt: true,
      },
    });

    console.info("signal reviewed", {
      signalId: id,
      actor: session.actor,
      nextReviewAt: nextReviewAt.toISOString(),
    });

    return NextResponse.json({ ok: true, signal: updated });
  } catch (error) {
    console.error("signal review failed", error);
    return NextResponse.json({ error: "review failed" }, { status: 500 });
  }
}
