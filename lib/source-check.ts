import { createHash } from "node:crypto";
import { prisma } from "./db";

export type SourceCheckStatus = "ok" | "changed" | "blocked" | "unreachable";

export type CheckableSource = {
  id: string;
  sourceUrl: string;
  baselineHash: string | null;
};

const TIMEOUT_MS = 15_000;

/**
 * 内容指纹：去掉脚本、样式和标签后对正文做哈希，
 * 降低页面里的随机串、广告位导致的高频假变化。
 */
export function hashSourceContent(buffer: Buffer): string {
  const raw = buffer.toString("utf8");
  const text = raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return createHash("sha256")
    .update(text.length > 0 ? text : buffer)
    .digest("hex");
}

function truncate(value: string, max = 300): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/**
 * 检查单条来源并写回健康表。
 * 首次检查建立基线；内容变化只标记 changed，不覆盖基线。
 */
export async function checkSourceRecord(
  source: CheckableSource,
): Promise<SourceCheckStatus> {
  try {
    const response = await fetch(source.sourceUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "User-Agent": "ZhiGuWen-SourceCheck/1.0 (public record verification)",
        Accept:
          "text/html,application/xhtml+xml,application/pdf;q=0.8,*/*;q=0.5",
      },
    });

    const statusCode = response.status;

    if (statusCode === 403 || statusCode === 429) {
      await prisma.sourceHealth.update({
        where: { id: source.id },
        data: {
          status: "blocked",
          lastCheckedAt: new Date(),
          lastStatusCode: statusCode,
          consecutiveFailures: { increment: 1 },
          lastError: `HTTP ${statusCode}`,
        },
      });
      return "blocked";
    }

    if (!response.ok) {
      await prisma.sourceHealth.update({
        where: { id: source.id },
        data: {
          status: "unreachable",
          lastCheckedAt: new Date(),
          lastStatusCode: statusCode,
          consecutiveFailures: { increment: 1 },
          lastError: `HTTP ${statusCode}`,
        },
      });
      return "unreachable";
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const hash = hashSourceContent(buffer);
    const baseline = source.baselineHash ?? hash;
    const changed = source.baselineHash !== null && source.baselineHash !== hash;

    await prisma.sourceHealth.update({
      where: { id: source.id },
      data: {
        status: changed ? "changed" : "ok",
        lastCheckedAt: new Date(),
        lastStatusCode: statusCode,
        baselineHash: baseline,
        lastSeenHash: hash,
        consecutiveFailures: 0,
        lastError: null,
      },
    });

    return changed ? "changed" : "ok";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await prisma.sourceHealth.update({
      where: { id: source.id },
      data: {
        status: "unreachable",
        lastCheckedAt: new Date(),
        lastStatusCode: null,
        consecutiveFailures: { increment: 1 },
        lastError: truncate(message),
      },
    });

    return "unreachable";
  }
}

export async function checkSourceById(id: string) {
  const source = await prisma.sourceHealth.findUnique({
    where: { id },
    select: { id: true, sourceUrl: true, baselineHash: true },
  });

  if (!source) return null;

  const status = await checkSourceRecord(source);

  const updated = await prisma.sourceHealth.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      lastCheckedAt: true,
      lastStatusCode: true,
      consecutiveFailures: true,
      lastError: true,
    },
  });

  return { status, source: updated };
}
