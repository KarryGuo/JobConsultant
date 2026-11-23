import { createHash } from "node:crypto";
import ruleConfig from "@/rules/rules.json";
import type {
  ComparisonOp,
  Hit,
  HitFact,
  RuleConfig,
  Severity,
  SignalLike,
} from "./types";

const RULES = ruleConfig as unknown as RuleConfig[];

/**
 * 规则内容哈希。报告缓存键必须包含它：
 * 规则文件改动后，即使忘了手工 bump PIPELINE_VERSION，也不会继续返回旧报告。
 */
export const RULES_VERSION = createHash("sha256")
  .update(JSON.stringify(ruleConfig))
  .digest("hex")
  .slice(0, 12);

const COMPARATORS: Record<ComparisonOp, (left: number, right: number) => boolean> = {
  gte: (left, right) => left >= right,
  lte: (left, right) => left <= right,
  gt: (left, right) => left > right,
  lt: (left, right) => left < right,
  eq: (left, right) => left === right,
};

const SEVERITY_RANK: Record<Severity, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function readPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (current && typeof current === "object" && !Array.isArray(current)) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, value);
}

function readNumber(value: unknown, path: string): number | null {
  const result = readPath(value, path);
  if (typeof result === "number" && Number.isFinite(result)) return result;
  if (typeof result === "string" && result.trim() !== "") {
    const parsed = Number(result);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isWithinMonths(signal: SignalLike, months: number | undefined, now: Date): boolean {
  if (!months) return true;
  const reference = signal.sourcePublishedAt ?? signal.fetchedAt;
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months);
  return reference >= cutoff;
}

function toFact(signal: SignalLike): HitFact {
  return {
    signalId: signal.id,
    type: signal.type,
    period: signal.period,
    value:
      signal.value && typeof signal.value === "object" && !Array.isArray(signal.value)
        ? (signal.value as Record<string, unknown>)
        : { value: signal.value },
    sourceUrl: signal.sourceUrl,
    sourceTitle: signal.sourceTitle,
    sourcePublishedAt: signal.sourcePublishedAt?.toISOString() ?? null,
    fetchedAt: signal.fetchedAt.toISOString(),
    snapshotHash: signal.snapshotHash,
  };
}

/**
 * 纯函数规则引擎：输入信号，输出命中。无网络、无随机、无模型。
 */
export function evaluateRules(
  signals: SignalLike[],
  rules: RuleConfig[] = RULES,
  now: Date = new Date(),
): Hit[] {
  const hits: Hit[] = [];

  for (const rule of rules) {
    const candidates = signals.filter((signal) => {
      if (signal.type !== rule.when.type) return false;
      if (rule.when.subtype) {
        const subtype = readPath(signal.value, "subtype");
        if (subtype !== rule.when.subtype) return false;
      }
      return isWithinMonths(signal, rule.when.withinMonths, now);
    });

    if (candidates.length === 0) continue;
    if (rule.when.minCount && candidates.length < rule.when.minCount) continue;

    let matched = candidates;

    if (rule.when.aggregate) {
      const { field, op, value, mode = "sum" } = rule.when.aggregate;
      const measured = candidates
        .map((signal) => ({ signal, value: readNumber(signal.value, field) }))
        .filter(
          (item): item is { signal: SignalLike; value: number } => item.value !== null,
        );

      if (measured.length === 0) continue;

      const numbers = measured.map((item) => item.value);
      const aggregated =
        mode === "max"
          ? Math.max(...numbers)
          : numbers.reduce((sum, item) => sum + item, 0);

      if (!COMPARATORS[op](aggregated, value)) continue;

      // max 模式下只把真正达到阈值的信号算作命中；
      // sum 模式下所有提供数值的信号共同构成命中。
      matched =
        mode === "max"
          ? measured
              .filter((item) => COMPARATORS[op](item.value, value))
              .map((item) => item.signal)
          : measured.map((item) => item.signal);
    } else if (rule.when.field) {
      const op = rule.when.op ?? "gte";
      const threshold = Number(rule.when.value ?? 0);
      matched = candidates.filter((signal) => {
        const value = readNumber(signal.value, rule.when.field as string);
        return value !== null && COMPARATORS[op](value, threshold);
      });
      if (matched.length === 0) continue;
    }

    hits.push({
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      signalIds: matched.map((signal) => signal.id),
      benignOptions: rule.benign,
      action: rule.action,
      questions: rule.questions,
      facts: matched.map(toFact),
    });
  }

  return hits
    .sort((left, right) => SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity])
    .slice(0, 4);
}
