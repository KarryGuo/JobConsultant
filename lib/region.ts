/**
 * 城市到省份的最小映射，用于导入时补全省份。
 * 当前只覆盖已收录和常见城市；完整行政区划应改为官方数据源。
 */
const PROVINCE_BY_CITY: Record<string, string> = {
  北京市: "北京市",
  上海市: "上海市",
  天津市: "天津市",
  重庆市: "重庆市",
  西安市: "陕西省",
  宝鸡市: "陕西省",
  渭南市: "陕西省",
  汉中市: "陕西省",
  咸阳市: "陕西省",
  铜川市: "陕西省",
  延安市: "陕西省",
  榆林市: "陕西省",
  安康市: "陕西省",
  商洛市: "陕西省",
  绵阳市: "四川省",
  成都市: "四川省",
  广州市: "广东省",
  深圳市: "广东省",
  杭州市: "浙江省",
  南京市: "江苏省",
  苏州市: "江苏省",
  武汉市: "湖北省",
  长沙市: "湖南省",
};

export function provinceForCity(
  city: string | null | undefined,
): string | null {
  if (!city) return null;
  return PROVINCE_BY_CITY[city.trim()] ?? null;
}

export function companyRegion(company: {
  province?: string | null;
  city?: string | null;
  industry?: string | null;
}): string {
  const parts = [company.province, company.city, company.industry].filter(
    (value): value is string => Boolean(value),
  );
  return parts.length > 0 ? parts.join(" · ") : "地区与行业待补充";
}
