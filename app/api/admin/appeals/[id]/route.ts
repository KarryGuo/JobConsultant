import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin-auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const InputSchema = z.object({
  status: z.enum(["open", "reviewing", "resolved", "rejected"]),
  internalNote: z.string().trim().max(2000).optional().default(""),
});

export async function PATCH(
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

  const existing = await prisma.appealRequest.findUnique({
    where: { id },
    select: { id: true, status: true, internalNote: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "appeal not found" }, { status: 404 });
  }

  const nextNote = parsed.data.internalNote || null;
  const statusChanged = existing.status !== parsed.data.status;
  const noteChanged = (existing.internalNote ?? null) !== nextNote;

  if (!statusChanged && !noteChanged) {
    return NextResponse.json({
      ok: true,
      changed: false,
      appeal: existing,
    });
  }

  const eventType =
    statusChanged && noteChanged
      ? "status_and_note_changed"
      : statusChanged
        ? "status_changed"
        : "note_updated";

  try {
    const appeal = await prisma.$transaction(async (tx) => {
      const updated = await tx.appealRequest.update({
        where: { id },
        data: {
          status: parsed.data.status,
          internalNote: nextNote,
          ...(statusChanged
            ? {
                handledAt:
                  parsed.data.status === "resolved" ||
                  parsed.data.status === "rejected"
                    ? new Date()
                    : null,
              }
            : {}),
        },
        select: {
          id: true,
          status: true,
          internalNote: true,
          handledAt: true,
          updatedAt: true,
        },
      });

      await tx.appealEvent.create({
        data: {
          appealId: id,
          type: eventType,
          fromStatus: existing.status,
          toStatus: parsed.data.status,
          internalNote: nextNote,
          actor: session.actor,
        },
      });

      return updated;
    });

    return NextResponse.json({ ok: true, changed: true, appeal });
  } catch (error) {
    console.error("appeal update failed", error);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }
}
