import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/**
 * 健康检查：真正探活数据库。部署平台据此判断实例是否可用；
 * 数据库不可达时返回 503，让负载均衡摘除该实例。
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: true, version: "0.1.0" });
  } catch (error) {
    console.error("health check failed", error);
    return NextResponse.json(
      { ok: false, db: false, version: "0.1.0" },
      { status: 503 },
    );
  }
}
