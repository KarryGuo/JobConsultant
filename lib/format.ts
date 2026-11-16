const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "long",
  day: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: Date | string | null | undefined): string {
  const date = asDate(value);
  return date ? dateFormatter.format(date) : "时间不详";
}

export function formatDateTime(value: Date | string | null | undefined): string {
  const date = asDate(value);
  return date ? dateTimeFormatter.format(date) : "时间不详";
}

const compactDateFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function formatCompactDate(value: Date | string | null | undefined): string {
  const date = asDate(value);
  return date ? compactDateFormatter.format(date).replace(/\//g, ".") : "—";
}

export function formatPeriod(period: string | null | undefined): string {
  if (!period) return "相关期间";
  return /^\d{4}$/.test(period) ? `${period} 年` : period;
}

/**
 * 只精确到月份的日期，不补一个假的“1 日”。
 */
export function formatMonth(value: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return formatDate(value);
  return `${match[1]}年${Number(match[2])}月`;
}

export function formatNumber(value: number, maximumFractionDigits = 4): string {
  return value.toLocaleString("zh-CN", {
    maximumFractionDigits,
    minimumFractionDigits: 0,
  });
}

export function formatYuan(amountYuan: number): string {
  return `${formatNumber(amountYuan / 10000, 6)} 万元`;
}

export function formatPercent(ratio: number): string {
  return `${formatNumber(ratio * 100, 1)}%`;
}

export function formatHash(hash: string): string {
  return hash.length > 16 ? `${hash.slice(0, 16)}…` : hash;
}
