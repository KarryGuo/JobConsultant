import { z } from "zod";
import type { Hit, ReportDraft } from "./types";

export const ReportPointSchema = z.object({
  text: z.string().min(1),
  ruleId: z.string().min(1),
  signalIds: z.array(z.string().min(1)).min(1),
  severity: z.enum(["high", "medium", "low"]),
  benign: z.string().min(1),
  action: z.string().min(1),
  questions: z.array(z.string().min(1)).max(3),
});

export const ReportDraftSchema = z
  .object({
    conclusion: z
      .string()
      .min(1)
      .refine((value) => Array.from(value).length <= 40, {
        message: "结论超过 40 个字",
      }),
    points: z.array(ReportPointSchema),
    status: z.enum(["ok", "no_hit"]),
    modelVersion: z.string().min(1),
    dataCutoff: z.date().nullable(),
  })
  .refine(
    (draft) =>
      draft.status === "no_hit" ? draft.points.length === 0 : draft.points.length > 0,
    { message: "报告状态与条目数量不一致" },
  );

export const ModelOutputSchema = z.object({
  conclusion: z.string().min(1),
  points: z
    .array(
      z.object({
        text: z.string().min(1),
        ruleId: z.string().min(1),
        benign: z.string().min(1),
        action: z.string().min(1),
      }),
    )
    .min(1)
    .max(4),
});

export function assertReportAgainstHits(draft: ReportDraft, hits: Hit[]): void {
  if (draft.status === "no_hit") return;

  const hitsByRule = new Map(hits.map((hit) => [hit.ruleId, hit]));

  for (const point of draft.points) {
    const hit = hitsByRule.get(point.ruleId);
    if (!hit) {
      throw new Error(`报告引用了不存在的规则：${point.ruleId}`);
    }
    if (point.signalIds.length === 0) {
      throw new Error(`报告条目缺少 signalIds：${point.ruleId}`);
    }
    for (const signalId of point.signalIds) {
      if (!hit.signalIds.includes(signalId)) {
        throw new Error(`报告条目引用了不属于该规则的信号：${signalId}`);
      }
    }
  }
}
