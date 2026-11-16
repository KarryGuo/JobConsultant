import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { checkSourceById } from "@/lib/source-check";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const result = await checkSourceById(id);
    if (!result) {
      return NextResponse.json({ error: "source not found" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      status: result.status,
      source: result.source,
    });
  } catch (error) {
    console.error("source check failed", error);
    return NextResponse.json({ error: "check failed" }, { status: 500 });
  }
}
