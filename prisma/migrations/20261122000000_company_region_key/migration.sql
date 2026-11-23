-- 同名企业可能分布在不同省市，不能再用 normalized 全局唯一。
-- regionKey = province|city，参与唯一约束；先回填历史数据，再替换唯一索引。

ALTER TABLE "Company" ADD COLUMN "regionKey" TEXT NOT NULL DEFAULT '';

UPDATE "Company"
SET "regionKey" = COALESCE("province", '') || '|' || COALESCE("city", '');

DROP INDEX IF EXISTS "Company_normalized_key";

CREATE UNIQUE INDEX "Company_normalized_regionKey_key" ON "Company"("normalized", "regionKey");
CREATE INDEX "Company_normalized_idx" ON "Company"("normalized");
