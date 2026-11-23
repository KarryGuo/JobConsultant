type SignalShape = { type: string; value: unknown } | null | undefined;

export function recordLabel(signal: SignalShape): string {
  // 主体已收录但还没有公开信号时，不能写成“公开记录”，避免误导用户。
  if (!signal) return "主体已收录";

  const value =
    signal.value &&
    typeof signal.value === "object" &&
    !Array.isArray(signal.value)
      ? (signal.value as Record<string, unknown>)
      : {};
  const subtype = typeof value.subtype === "string" ? value.subtype : "";

  switch (subtype) {
    case "wage_arrears":
      return "欠薪记录";
    case "wage_arrears_resolved":
      return "欠薪已支付";
    case "social_insurance":
      return "社保违规";
    case "employment_scam":
      return "违规收费";
    default:
      break;
  }

  switch (signal.type) {
    case "court_exec":
      return "被执行";
    case "insured_drop":
      return "参保下降";
    case "hiring_anomaly":
      return "岗位异常";
    case "labor_violation":
      return "劳动用工记录";
    default:
      return "公开记录";
  }
}
