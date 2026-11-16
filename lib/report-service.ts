import { createHash } from "node:crypto";
import { prisma } from "./db";
import { explain } from "./explain";
import { evaluateRules } from "./rules";
import type { SignalLike } from "./types";
import { ReportDraftSchema, assertReportAgainstHits } from "./validation";

const dateBucketFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const PIPELINE_VERSION = "v3";

/**
 * 模型开关/模型名变化时必须生成新报告，
 * 否则当天缓存会继续返回旧模型或模板生成的措辞。
 */
function modelCacheKey(): string {
  if (!process.env.MODEL_API_KEY) return "template";
  const baseUrl =
    process.env.MODEL_BASE_URL ?? "https://api.deepseek.com/v1";
  const model = process.env.MODEL_NAME ?? "deepseek-flash";
  return `${baseUrl}|${model}`;
}

function buildCacheKey(
  companyId: string,
  signals: Array<{
    id: string;
    snapshotHash: string;
    fetchedAt: Date;
    correctedAt?: Date | null;
    correctionNote?: string | null;
  }>,
  now = new Date(),
): string {
  // 缓存键包含当天日期 + 管线版本 + 信号版本；
  // 模板/规则更新或信号更正都会生成新报告，避免页面停留在旧结论。
  const material = [
    PIPELINE_VERSION,
    modelCacheKey(),
    ...signals
      .map(
        (signal) =>
          `${signal.id}:${signal.snapshotHash}:${signal.fetchedAt.toISOString()}:${
            signal.correctedAt?.toISOString() ?? ""
          }:${signal.correctionNote ?? ""}`,
      )
      .sort(),
  ].join("|");
  const inputHash = createHash("sha256").update(material).digest("hex").slice(0, 16);
  return `${companyId}:${dateBucketFormatter.format(now)}:${inputHash}`;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

export async function getCompanyReport(companyId: string) {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: {
      signals: {
        orderBy: [{ sourcePublishedAt: "desc" }, { fetchedAt: "desc" }],
      },
    },
  });

  if (!company) return null;

  // 已作废的信号不再参与规则判定、时间线和证据展示。
  const activeSignals = company.signals.filter(
    (signal) => signal.invalidatedAt === null,
  );
  const companyView = { ...company, signals: activeSignals };

  const feedbacks = await prisma.interviewFeedback.findMany({
    where: { companyId },
    select: {
      roundsBand: true,
      daysToResultBand: true,
      askedPrivacy: true,
      testTaskBand: true,
      rejectionBand: true,
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const cacheKey = buildCacheKey(companyId, activeSignals);
  const cached = await prisma.report.findUnique({ where: { cacheKey } });
  if (cached) {
    return {
      company: companyView,
      signals: activeSignals,
      report: cached,
      feedbacks,
    };
  }

  const signals: SignalLike[] = activeSignals.map((signal) => ({
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
    snapshotPath: signal.snapshotPath,
  }));

  const hits = evaluateRules(signals);
  const dataCutoff = signals.reduce<Date | null>(
    (latest, signal) =>
      !latest || signal.fetchedAt.getTime() > latest.getTime() ? signal.fetchedAt : latest,
    null,
  );

  const draft = await explain(company.name, hits, dataCutoff);
  const parsed = ReportDraftSchema.parse(draft);
  assertReportAgainstHits(parsed, hits);

  try {
    const report = await prisma.report.upsert({
      where: { cacheKey },
      update: {},
      create: {
        companyId,
        cacheKey,
        conclusion: parsed.conclusion,
        points: parsed.points,
        status: parsed.status,
        dataCutoff: parsed.dataCutoff,
        modelVersion: parsed.modelVersion,
      },
    });

    return {
      company: companyView,
      signals: activeSignals,
      report,
      feedbacks,
    };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const report = await prisma.report.findUnique({ where: { cacheKey } });
      if (report) {
        return {
          company: companyView,
          signals: activeSignals,
          report,
          feedbacks,
        };
      }
    }
    throw error;
  }
}
