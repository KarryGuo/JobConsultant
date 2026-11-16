import assert from "node:assert/strict";
import { summarizeFeedback, type FeedbackSample } from "../lib/feedback";

const samples: FeedbackSample[] = [
  {
    roundsBand: "4-6",
    daysToResultBand: "2_4_weeks",
    askedPrivacy: "yes",
    testTaskBand: "over_2h",
    rejectionBand: "with_reason",
  },
  {
    roundsBand: "4-6",
    daysToResultBand: "2_4_weeks",
    askedPrivacy: "no",
    testTaskBand: "none",
    rejectionBand: "without_reason",
  },
  {
    roundsBand: "1-3",
    daysToResultBand: "within_1_week",
    askedPrivacy: "decline",
    testTaskBand: "within_2h",
    rejectionBand: "none",
  },
  {
    roundsBand: "7+",
    daysToResultBand: "2_4_weeks",
    askedPrivacy: "yes",
    testTaskBand: "over_2h",
    rejectionBand: "none",
  },
  {
    roundsBand: "4-6",
    daysToResultBand: "longer",
    askedPrivacy: "no",
    testTaskBand: "none",
    rejectionBand: "with_reason",
  },
];

const stats = summarizeFeedback(samples);

assert.equal(stats.total, 5);
assert.deepEqual(stats.roundsMode, { label: "4–6 轮", count: 3 });
assert.deepEqual(stats.daysMode, { label: "2–4 周", count: 3 });
assert.equal(stats.privacySample, 4, "decline 不计入比例分母");
assert.equal(stats.privacyRate, 0.5);
assert.equal(stats.rejectionSample, 5);
assert.equal(stats.rejectionRate, 0.6);

const noPrivacy = summarizeFeedback([
  {
    roundsBand: null,
    daysToResultBand: null,
    askedPrivacy: "decline",
    testTaskBand: null,
    rejectionBand: null,
  },
]);
assert.equal(noPrivacy.privacyRate, null);
assert.equal(noPrivacy.privacySample, 0);
assert.equal(noPrivacy.rejectionRate, null);

console.log("feedback checks passed");
