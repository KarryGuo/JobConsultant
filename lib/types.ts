export type Severity = "high" | "medium" | "low";

export type ComparisonOp = "gte" | "lte" | "gt" | "lt" | "eq";

export type RuleConfig = {
  id: string;
  name: string;
  when: {
    type: string;
    subtype?: string;
    field?: string;
    op?: ComparisonOp;
    value?: number | string;
    aggregate?: {
      field: string;
      op: ComparisonOp;
      value: number;
      mode?: "sum" | "max";
    };
    withinMonths?: number;
    minCount?: number;
  };
  severity: Severity;
  benign: string[];
  action: string;
  questions: string[];
};

export type SignalLike = {
  id: string;
  type: string;
  period: string | null;
  value: unknown;
  severity: string;
  sourceUrl: string;
  sourceTitle: string;
  sourcePublishedAt: Date | null;
  fetchedAt: Date;
  snapshotHash: string;
  snapshotPath: string | null;
};

export type HitFact = {
  signalId: string;
  type: string;
  period: string | null;
  value: Record<string, unknown>;
  sourceUrl: string;
  sourceTitle: string;
  sourcePublishedAt: string | null;
  fetchedAt: string;
  snapshotHash: string;
};

export type Hit = {
  ruleId: string;
  ruleName: string;
  severity: Severity;
  signalIds: string[];
  benignOptions: string[];
  action: string;
  questions: string[];
  facts: HitFact[];
};

export type ReportPoint = {
  text: string;
  ruleId: string;
  signalIds: string[];
  severity: Severity;
  benign: string;
  action: string;
  questions: string[];
};

export type ReportDraft = {
  conclusion: string;
  points: ReportPoint[];
  status: "ok" | "no_hit";
  modelVersion: string;
  dataCutoff: Date | null;
};
