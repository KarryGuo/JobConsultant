import { sourceHealthLabel } from "./source-health";

export type SourceAlertItem = {
  sourceTitle: string;
  sourceUrl: string;
  status: string;
  consecutiveFailures: number;
  lastError: string | null;
};

const ALERT_TIMEOUT_MS = 10_000;

export function buildSourceAlertText(items: SourceAlertItem[]): string {
  const lines = items.map((item) => {
    const detail = item.lastError ? `：${item.lastError}` : "";
    const failures =
      item.consecutiveFailures > 0
        ? `（连续失败 ${item.consecutiveFailures} 次）`
        : "";
    return `- [${sourceHealthLabel(item.status)}] ${item.sourceTitle} ${item.sourceUrl}${detail}${failures}`;
  });

  return [
    `职顾问来源健康检查：${items.length} 个来源需要处理`,
    ...lines,
  ].join("\n");
}

/**
 * 同时带 text 和 msg_type/content，兼容通用的 Slack 风格
 * 与企业微信/飞书风格文本 Webhook。
 */
export function buildSourceAlertPayload(items: SourceAlertItem[]) {
  const text = buildSourceAlertText(items);
  return {
    text,
    msg_type: "text",
    content: { text },
  };
}

export async function sendSourceAlert(
  webhook: string,
  items: SourceAlertItem[],
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildSourceAlertPayload(items)),
      signal: AbortSignal.timeout(ALERT_TIMEOUT_MS),
    });

    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}` };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
