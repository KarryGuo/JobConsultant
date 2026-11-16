import { NextRequest, NextResponse } from "next/server";
import { matchCompany } from "@/lib/match";
import {
  clientKey,
  createRateLimiter,
  retryAfterSeconds,
} from "@/lib/rate-limit";

// 搜索是纯读接口，限制单 IP 每分钟 120 次，挡住脚本遍历。
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

  const query = request.nextUrl.searchParams.get("q") ?? "";

  try {
    const result = await matchCompany(query);
    return NextResponse.json(result);
  } catch (error) {
    console.error("search failed", error);
    return NextResponse.json({ error: "search failed" }, { status: 500 });
  }
}
