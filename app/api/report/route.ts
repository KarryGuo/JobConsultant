import { NextRequest, NextResponse } from "next/server";
import {
  clientKey,
  createRateLimiter,
  retryAfterSeconds,
} from "@/lib/rate-limit";
import { getCompanyReport } from "@/lib/report-service";

// 报告接口可能触发一次报告生成，限制单 IP 每分钟 60 次。
const limiter = createRateLimiter({ limit: 60, windowMs: 60_000 });

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

  const companyId = request.nextUrl.searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  try {
    const result = await getCompanyReport(companyId);
    if (!result) {
      return NextResponse.json({ error: "company not found" }, { status: 404 });
    }

    // 不返回 feedbacks 原始数组：页面只在样本达到阈值后展示聚合结果，
    // 这个接口不应绕过同样的隐私边界。
    // 信号使用显式白名单，避免把 snapshotPath 等服务器内部路径带出去。
    const publicSignals = result.signals.map((signal) => ({
      id: signal.id,
      type: signal.type,
      period: signal.period,
      value: signal.value,
      severity: signal.severity,
      sourceUrl: signal.sourceUrl,
      sourceTitle: signal.sourceTitle,
      sourcePublishedAt: signal.sourcePublishedAt,
      fetchedAt: signal.fetchedAt,
      snapshotHash: signal.snapshotHash,
      invalidatedAt: signal.invalidatedAt,
      correctedAt: signal.correctedAt,
      correctionNote: signal.correctionNote,
      lastVerifiedAt: signal.lastVerifiedAt,
      reviewCycleDays: signal.reviewCycleDays,
      nextReviewAt: signal.nextReviewAt,
    }));

    const publicCompany = {
      id: result.company.id,
      name: result.company.name,
      creditCode: result.company.creditCode,
      establishedAt: result.company.establishedAt,
      capital: result.company.capital,
      status: result.company.status,
      province: result.company.province,
      city: result.company.city,
      industry: result.company.industry,
      depth: result.company.depth,
    };

    return NextResponse.json({
      company: publicCompany,
      signals: publicSignals,
      report: result.report,
    });
  } catch (error) {
    console.error("report failed", error);
    return NextResponse.json({ error: "report failed" }, { status: 500 });
  }
}
