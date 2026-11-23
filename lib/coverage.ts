export const COVERED_REGIONS = [
  "陕西省",
  "河南省",
  "安徽省",
  "湖北省",
  "福建省",
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
