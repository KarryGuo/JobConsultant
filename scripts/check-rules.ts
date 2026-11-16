import assert from "node:assert/strict";
import { evaluateRules } from "../lib/rules";
import { buildTemplateReport } from "../lib/template";
import type { SignalLike } from "../lib/types";

const BASE = {
  type: "insured_drop",
  period: "2024",
  severity: "high",
  sourceUrl: "https://example.gov.cn/notice",
  sourceTitle: "测试来源",
  sourcePublishedAt: new Date("2026-10-15"),
  fetchedAt: new Date("2026-11-14"),
  snapshotHash: "test-hash",
  snapshotPath: null,
};

function signal(overrides: Partial<SignalLike>): SignalLike {
  return { ...BASE, id: "s0", value: {}, ...overrides };
}

// 1. 阈值命中：0.1 / 0.35 / 0.4 只有后两条命中
const insuredSignals = [0.1, 0.35, 0.4].map((ratio, index) =>
  signal({ id: `insured-${index}`, value: { ratio, from: 100, to: 90 } }),
);
const insuredHits = evaluateRules(insuredSignals);
const r01 = insuredHits.find((hit) => hit.ruleId === "R01");
assert.ok(r01, "R01 应该命中");
assert.equal(r01.signalIds.length, 2, "R01 只应包含达到阈值的两条信号");

// 2. 空输入不编造
assert.deepEqual(evaluateRules([]), [], "空信号必须返回空数组");

// 3. 欠薪：规则命中 + 模板报告保留原始数字与来源机构
const laborSignal = signal({
  id: "labor-1",
  type: "labor_violation",
  period: "2026",
  value: {
    count: 1,
    subtype: "wage_arrears",
    workerCount: 19,
    amountYuan: 239771,
    stage: "移送公安机关立案查处",
    stageDate: "2026-06-30",
    complaintPeriod: "2025-12",
    violation: "拖欠劳动报酬",
    authority: "西安市碑林区人力资源和社会保障局",
  },
});
const laborHits = evaluateRules([laborSignal]);
const r04 = laborHits.find((hit) => hit.ruleId === "R04");
assert.ok(r04, "R04 应该命中");
assert.deepEqual(r04.signalIds, ["labor-1"]);

const report = buildTemplateReport(laborHits, new Date("2026-11-14"));
assert.equal(report.status, "ok");
assert.equal(report.points.length, 1);
assert.match(report.points[0].text, /19/);
assert.match(report.points[0].text, /23\.9771/);
assert.match(report.points[0].text, /2025年12月/);
assert.match(report.points[0].text, /西安市碑林区人力资源和社会保障局/);
assert.ok(report.conclusion.includes("欠薪记录"), "结论应说明规则类型");
assert.ok(
  Array.from(report.conclusion).length <= 40,
  "结论不能超过 40 个字",
);
assert.ok(
  report.points[0].benign.includes("司法程序"),
  "模板应优先选择不替案件下结论的良性解释",
);

// 3.1 同一规则命中多条信号：汇总条数、人数和金额，而不是只写第一条
const multiLaborSignals = [
  signal({
    id: "labor-multi-a",
    type: "labor_violation",
    period: "2026",
    value: {
      count: 1,
      subtype: "wage_arrears",
      workerCount: 10,
      amountYuan: 100000,
      stage: "移送公安机关立案查处",
      stageDate: "2026-06-30",
      complaintPeriod: "2025-11",
      authority: "甲区人力资源和社会保障局",
    },
  }),
  signal({
    id: "labor-multi-b",
    type: "labor_violation",
    period: "2026",
    value: {
      count: 1,
      subtype: "wage_arrears",
      workerCount: 5,
      amountYuan: 50000,
      stage: "行政处罚",
      stageDate: "2026-08-01",
      complaintPeriod: "2026-01",
      authority: "乙区人力资源和社会保障局",
    },
  }),
];
const multiLaborHits = evaluateRules(multiLaborSignals);
const multiR04 = multiLaborHits.find((hit) => hit.ruleId === "R04");
assert.ok(multiR04, "多条欠薪信号应该命中 R04");
assert.equal(multiR04.signalIds.length, 2, "R04 应包含两条信号");

const multiReport = buildTemplateReport(multiLaborHits, new Date("2026-11-14"));
assert.match(multiReport.points[0].text, /共 2 条欠薪记录/);
assert.match(multiReport.points[0].text, /15 名劳动者/);
assert.match(multiReport.points[0].text, /15 万元/);
assert.match(multiReport.conclusion, /2 条/);

// 4. 违规收费：金额区间 + 吊销许可证
const scamSignal = signal({
  id: "scam-1",
  type: "labor_violation",
  period: "2026",
  value: {
    count: 1,
    subtype: "employment_scam",
    violation: "以“编制”“保过”为名收取高额中介服务费，无法兑现且拒绝退还",
    violationPeriod: "2025年以来",
    amountMinYuan: 130000,
    amountMaxYuan: 200000,
    stage: "吊销人力资源服务许可证",
    stagePeriod: "2026-07",
  },
});
const scamHits = evaluateRules([scamSignal]);
const r06 = scamHits.find((hit) => hit.ruleId === "R06");
assert.ok(r06, "R06 应该命中");
const scamReport = buildTemplateReport(scamHits, new Date("2026-11-14"));
assert.match(scamReport.points[0].text, /13–20 万元/);
assert.match(scamReport.points[0].text, /吊销人力资源服务许可证/);
assert.ok(scamReport.conclusion.includes("违规收费记录"));

// 5. 社保违规：罚款金额
const insuranceSignal = signal({
  id: "insurance-1",
  type: "labor_violation",
  period: "2026",
  value: {
    count: 1,
    subtype: "social_insurance",
    violation: "未依法办理社会保险登记，经限期整改仍未履行",
    penaltyYuan: 20000,
    stage: "行政处罚",
    stageDate: "2026-03-04",
    complaintPeriod: "2025-11",
  },
});
const insuranceHits = evaluateRules([insuranceSignal]);
const r05 = insuranceHits.find((hit) => hit.ruleId === "R05");
assert.ok(r05, "R05 应该命中");
const insuranceReport = buildTemplateReport(insuranceHits, new Date("2026-11-14"));
assert.match(insuranceReport.points[0].text, /2 万元/);
assert.ok(insuranceReport.conclusion.includes("社保违规记录"));

// 5.1 多类规则：结论按“类 + 条数”描述，且不超过 40 字
const mixedReport = buildTemplateReport(
  [...laborHits, ...insuranceHits],
  new Date("2026-11-14"),
);
assert.equal(mixedReport.points.length, 2);
assert.match(mixedReport.conclusion, /2 类公开记录/);
assert.ok(
  Array.from(mixedReport.conclusion).length <= 40,
  "多类结论不能超过 40 个字",
);

// 6. 已支付欠薪：低严重度，正文说明已支付
const resolvedSignal = signal({
  id: "resolved-1",
  type: "labor_violation",
  period: "2026",
  severity: "medium",
  value: {
    count: 1,
    subtype: "wage_arrears_resolved",
    workerCount: 11,
    amountYuan: 69048,
    violation: "拖欠劳动报酬",
    complaintDate: "2026-04-16",
    stage: "劳动报酬已全部支付",
    stageDate: "2026-08-07",
    paidDate: "2026-08-07",
  },
});
const resolvedHits = evaluateRules([resolvedSignal]);
const r07 = resolvedHits.find((hit) => hit.ruleId === "R07");
assert.ok(r07, "R07 应该命中");
assert.equal(r07.severity, "low");
const resolvedReport = buildTemplateReport(resolvedHits, new Date("2026-11-14"));
assert.match(resolvedReport.points[0].text, /6\.9048/);
assert.match(resolvedReport.points[0].text, /已全部支付/);
assert.ok(resolvedReport.points[0].benign.includes("已全部支付"));

// 7. 无命中时不给“低风险”结论
const emptyReport = buildTemplateReport([], null);
assert.equal(emptyReport.status, "no_hit");
assert.deepEqual(emptyReport.points, []);

console.log("rules checks passed");
