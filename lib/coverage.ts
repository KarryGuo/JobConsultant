export const COVERED_REGIONS = [
  "陕西省",
  "河南省",
  "安徽省",
  "湖北省",
  "福建省",
  "北京市",
  "山西省",
  "天津市",
  "四川省",
] as const;

/**
 * 暂未接入自动采集、但保留官方直查入口的省份。
 * 这些站点目前对自动访问有限制（拒绝或连接异常），只能人工核验后补充。
 */
export const DIRECT_LOOKUP_ONLY_REGIONS = [
  "浙江省",
  "广东省",
  "江西省",
] as const;

/** 尚未接入自动采集的其余省级行政区，按批次推进。 */
export const PENDING_REGIONS = [
  "河北省",
  "内蒙古自治区",
  "辽宁省",
  "吉林省",
  "黑龙江省",
  "上海市",
  "江苏省",
  "山东省",
  "湖南省",
  "广西壮族自治区",
  "海南省",
  "重庆市",
  "贵州省",
  "云南省",
  "西藏自治区",
  "甘肃省",
  "青海省",
  "宁夏回族自治区",
  "新疆维吾尔自治区",
] as const;

export const COVERED_RISK_TYPES = ["劳动用工记录"] as const;

export const UNCOVERED_RISK_TYPES = [
  "被执行记录",
  "经营异常",
  "失信被执行",
  "破产重整",
  "欠税公告",
  "行政处罚",
] as const;

export const COVERAGE_WARNING = "没有记录不代表没有风险。";

export const COVERAGE_SUMMARY = `已覆盖：${COVERED_REGIONS.join(
  "、",
)}人社部门公开的${COVERED_RISK_TYPES.join(
  "、",
)}。未覆盖：${UNCOVERED_RISK_TYPES.join("、")}。${COVERAGE_WARNING}`;
