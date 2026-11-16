-- AlterTable
ALTER TABLE "Signal" ADD COLUMN     "lastVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "nextReviewAt" TIMESTAMP(3),
ADD COLUMN     "reviewCycleDays" INTEGER NOT NULL DEFAULT 30;

-- CreateTable
CREATE TABLE "SourceHealth" (
    "id" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceTitle" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "lastCheckedAt" TIMESTAMP(3),
    "lastStatusCode" INTEGER,
    "baselineHash" TEXT,
    "lastSeenHash" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceHealth_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SourceHealth_sourceUrl_key" ON "SourceHealth"("sourceUrl");

-- CreateIndex
CREATE INDEX "SourceHealth_status_idx" ON "SourceHealth"("status");

-- CreateIndex
CREATE INDEX "SourceHealth_lastCheckedAt_idx" ON "SourceHealth"("lastCheckedAt");

-- CreateIndex
CREATE INDEX "Signal_nextReviewAt_idx" ON "Signal"("nextReviewAt");

-- 回填既有信号：以抓取时间作为最近核验时间，按类型设置默认复核周期。
UPDATE "Signal"
SET "lastVerifiedAt" = "fetchedAt",
    "reviewCycleDays" = CASE "type"
      WHEN 'hiring_anomaly' THEN 14
      WHEN 'insured_drop' THEN 90
      ELSE 30
    END,
    "nextReviewAt" = "fetchedAt" + (
      CASE "type"
        WHEN 'hiring_anomaly' THEN 14
        WHEN 'insured_drop' THEN 90
        ELSE 30
      END
    ) * INTERVAL '1 day';

-- 为已有来源建立健康记录，等待首次检查。
INSERT INTO "SourceHealth" ("id", "sourceUrl", "sourceTitle", "status", "createdAt", "updatedAt")
SELECT md5("sourceUrl"), "sourceUrl", MAX("sourceTitle"), 'unknown', now(), now()
FROM "Signal"
GROUP BY "sourceUrl"
ON CONFLICT ("sourceUrl") DO NOTHING;
