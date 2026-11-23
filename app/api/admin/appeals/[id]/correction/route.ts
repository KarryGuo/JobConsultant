import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const InputSchema = z.object({
  signalId: z.string().trim().max(64).optional().default(""),
  action: z.enum(["invalidate", "annotate", "none"]),
  note: z.string().trim().max(500).optional().default(""),
  publicNote: z.string().trim().max(500).optional().default(""),
});

/**
 * 把申诉处理结果落到数据层：
 * - invalidate：作废信号，不再参与规则判定与展示；
 * - annotate：保留信号，只追加更正说明；
 * - none：不改信号，仅登记公示说明。
 * 任何一项都会让报告缓存键变化，下次访问重新生成报告。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

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

  const { signalId, action, note, publicNote } = parsed.data;

  if (action !== "none" && !signalId) {
    return NextResponse.json(
      { error: "signalId is required" },
      { status: 400 },
    );
  }
  if (action !== "none" && note.length < 5) {
    return NextResponse.json(
      { error: "note must be at least 5 characters" },
      { status: 400 },
    );
  }
  if (action === "none" && publicNote.length < 5) {
    return NextResponse.json(
      { error: "publicNote is required when no signal is changed" },
      { status: 400 },
    );
  }

  const appeal = await prisma.appealRequest.findUnique({
    where: { id },
    select: {
      id: true,
      companyId: true,
      status: true,
    },
  });

  if (!appeal) {
    return NextResponse.json({ error: "appeal not found" }, { status: 404 });
  }

  let signalSourceKey: string | null = null;

  if (signalId) {
    if (!appeal.companyId) {
      return NextResponse.json(
        { error: "appeal has no company context" },
        { status: 400 },
      );
    }

    const signal = await prisma.signal.findUnique({
      where: { id: signalId },
      select: {
        id: true,
        companyId: true,
        sourceKey: true,
        invalidatedAt: true,
      },
    });

    if (!signal || signal.companyId !== appeal.companyId) {
      return NextResponse.json({ error: "signal not found" }, { status: 404 });
    }

    if (signal.invalidatedAt) {
      return NextResponse.json(
        { error: "signal already invalidated" },
        { status: 409 },
      );
    }

    signalSourceKey = signal.sourceKey;
  }

  const now = new Date();
  const actionLabel =
    action === "invalidate"
      ? "作废记录"
      : action === "annotate"
        ? "更正说明"
        : "公示说明";

  try {
    await prisma.$transaction(async (tx) => {
      if (signalId && action !== "none") {
        await tx.signal.update({
          where: { id: signalId },
          data: {
            correctedAt: now,
            correctionNote: note,
            ...(action === "invalidate" ? { invalidatedAt: now } : {}),
          },
        });

        await tx.signalAuditEvent.create({
          data: {
            signalId,
            sourceKey: signalSourceKey,
            action: action === "invalidate" ? "invalidated" : "annotated",
            actor: session.actor,
            note,
          },
        });
      }

      await tx.appealRequest.update({
        where: { id },
        data: {
          status: "resolved",
          handledAt: now,
          ...(publicNote ? { publicNote } : {}),
        },
      });

      await tx.appealEvent.create({
        data: {
          appealId: id,
          type: "correction_applied",
          fromStatus: appeal.status,
          toStatus: "resolved",
          internalNote: action === "none" ? null : `[${actionLabel}] ${note}`,
          actor: session.actor,
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("appeal correction failed", error);
    return NextResponse.json({ error: "correction failed" }, { status: 500 });
  }
}
