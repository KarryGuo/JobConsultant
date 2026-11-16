-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "province" TEXT;

-- CreateIndex
CREATE INDEX "Company_province_city_idx" ON "Company"("province", "city");

-- 回填当前收录企业的省份；新数据由导入脚本按 city 推导或显式传入。
UPDATE "Company"
SET "province" = CASE
  WHEN "city" IN ('西安市', '宝鸡市', '渭南市', '汉中市', '咸阳市', '铜川市', '延安市', '榆林市', '安康市', '商洛市') THEN '陕西省'
  WHEN "city" = '绵阳市' THEN '四川省'
  ELSE "province"
END
WHERE "province" IS NULL;
