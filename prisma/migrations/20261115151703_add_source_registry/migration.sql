-- AlterTable
ALTER TABLE "Signal" ADD COLUMN     "sourceKey" TEXT;

-- CreateTable
CREATE TABLE "SourceRegistry" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'A',
    "region" TEXT,
    "baseUrl" TEXT,
    "accessType" TEXT NOT NULL DEFAULT 'public_web',
    "fetchMode" TEXT NOT NULL DEFAULT 'manual',
    "reviewCycleDays" INTEGER NOT NULL DEFAULT 30,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "lastImportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceRegistry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SourceRegistry_key_key" ON "SourceRegistry"("key");

-- CreateIndex
CREATE INDEX "SourceRegistry_category_idx" ON "SourceRegistry"("category");

-- CreateIndex
CREATE INDEX "SourceRegistry_enabled_idx" ON "SourceRegistry"("enabled");

-- CreateIndex
CREATE INDEX "Signal_sourceKey_idx" ON "Signal"("sourceKey");

-- 回填当前唯一已采集来源，保证存量信号的 sourceKey 可追溯。
INSERT INTO "SourceRegistry" (
  "id", "key", "name", "category", "level", "region", "baseUrl",
  "accessType", "fetchMode", "reviewCycleDays", "enabled", "notes",
  "createdAt", "updatedAt"
)
VALUES (
  md5('shaanxi-hrss-labor-violation'),
  'shaanxi-hrss-labor-violation',
  '陕西省人社厅重大劳动保障违法行为社会公布',
  'labor_violation',
  'A',
  '陕西省',
  'https://rst.shaanxi.gov.cn/',
  'public_web',
  'manual',
  30,
  true,
  '当前已采集来源；同一公告可覆盖多家企业。',
  now(),
  now()
)
ON CONFLICT ("key") DO NOTHING;

UPDATE "Signal"
SET "sourceKey" = 'shaanxi-hrss-labor-violation'
WHERE "sourceUrl" LIKE 'https://rst.shaanxi.gov.cn/%';
