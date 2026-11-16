import { NextRequest, NextResponse } from "next/server";
import { suggestCompanies } from "@/lib/match";
import {
  clientKey,
  createRateLimiter,
  retryAfterSeconds,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

const limiter = createRateLimiter({ limit: 120, windowMs: 60_000 });

export async function GET(request: NextRequest) {
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

  const raw = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 60);
  if (!raw) {
    return NextResponse.json({ query: "", items: [] });
  }

  // 纯英文/数字输入至少 2 个字符，避免单字母触发全量扫描。
  if (/^[a-z0-9]+$/i.test(raw) && raw.length < 2) {
    return NextResponse.json({ query: raw, items: [] });
  }

  try {
    const items = await suggestCompanies(raw, 8);
    return NextResponse.json({ query: raw, items });
  } catch (error) {
    console.error("search suggest failed", error);
    return NextResponse.json({ error: "suggest failed" }, { status: 500 });
  }
}
