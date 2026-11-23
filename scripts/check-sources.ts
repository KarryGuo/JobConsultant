import { prisma } from "../lib/db";
import { buildSourceAlertPayload, sendSourceAlert } from "../lib/source-alert";
import {
  checkSourceRecord,
  type SourceCheckStatus,
} from "../lib/source-check";

const CONCURRENCY = 3;

async function main() {
  const args = process.argv.slice(2);
  const acceptChanges = args.includes("--accept-changes");
  const dryRun = args.includes("--dry-run");
  const urlIndex = args.indexOf("--url");
  const onlyUrl = urlIndex >= 0 ? args[urlIndex + 1]?.trim() : undefined;

  if (acceptChanges) {
    // 人工复核后，把最近一次抓取结果确认为新的基线。
    const accepted = await prisma.$executeRaw`
      UPDATE "SourceHealth"
      SET "baselineHash" = "lastSeenHash",
          "status" = 'ok',
          "updatedAt" = now()
      WHERE "status" = 'changed'
        AND "lastSeenHash" IS NOT NULL
    `;
    console.log(`accepted changed sources: ${accepted}`);
  }

  const sources = await prisma.sourceHealth.findMany({
    where: onlyUrl ? { sourceUrl: onlyUrl } : undefined,
    select: {
      id: true,
      sourceUrl: true,
      baselineHash: true,
    },
    orderBy: { sourceUrl: "asc" },
  });

  if (sources.length === 0) {
    console.log("no sources to check");
    return;
  }

  const queue = [...sources];
  const results: Record<SourceCheckStatus, number> = {
    ok: 0,
    changed: 0,
    blocked: 0,
    unreachable: 0,
  };

  async function worker() {
    while (queue.length > 0) {
      const source = queue.shift();
      if (!source) break;

      const status = await checkSourceRecord(source);
      results[status] += 1;
      console.log(`${status}\t${source.sourceUrl}`);
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(CONCURRENCY, sources.length) },
      () => worker(),
    ),
  );

  console.log(
    JSON.stringify(
      {
        checked: sources.length,
        results,
      },
      null,
      2,
    ),
  );

  const problems = await prisma.sourceHealth.findMany({
    where: {
      status: { in: ["changed", "blocked", "unreachable"] },
      ...(onlyUrl ? { sourceUrl: onlyUrl } : {}),
    },
    select: {
      sourceTitle: true,
      sourceUrl: true,
      status: true,
      consecutiveFailures: true,
      lastError: true,
    },
    orderBy: [{ status: "asc" }, { sourceUrl: "asc" }],
  });

  // 已启用但长期没有导入的来源，同样需要提醒。
  // 这能发现“页面还能打开，但采集脚本已经很久没跑”的情况。
  const STALE_IMPORT_DAYS = 35;
  const staleCutoff = Date.now() - STALE_IMPORT_DAYS * 24 * 60 * 60 * 1000;
  const enabledRegistry = await prisma.sourceRegistry.findMany({
    where: { enabled: true },
    select: {
      key: true,
      name: true,
      baseUrl: true,
      lastImportedAt: true,
    },
    orderBy: { key: "asc" },
  });
  const staleSources = enabledRegistry
    .filter((source) => {
      if (onlyUrl && !onlyUrl.startsWith(source.baseUrl ?? "")) return false;
      return !source.lastImportedAt || source.lastImportedAt.getTime() < staleCutoff;
    })
    .map((source) => ({
      key: source.key,
      name: source.name,
      baseUrl: source.baseUrl,
      lastImportedAt: source.lastImportedAt?.toISOString() ?? null,
    }));

  const staleAlertItems = staleSources.map((source) => ({
    sourceTitle: source.name,
    sourceUrl: source.baseUrl ?? "",
    status: "stale",
    consecutiveFailures: 0,
    lastError: source.lastImportedAt
      ? `最近导入 ${source.lastImportedAt}，超过 ${STALE_IMPORT_DAYS} 天`
      : "尚未导入",
  }));

  const alertItems = [...problems, ...staleAlertItems];

  if (alertItems.length > 0) {
    const webhook = process.env.SOURCE_ALERT_WEBHOOK?.trim();

    if (dryRun) {
      console.log(JSON.stringify(buildSourceAlertPayload(alertItems), null, 2));
    } else if (webhook) {
      const result = await sendSourceAlert(webhook, alertItems);
      console.log(
        result.ok
          ? `alert sent: ${alertItems.length} item(s)`
          : `alert failed: ${result.error}`,
      );
    } else {
      console.log("SOURCE_ALERT_WEBHOOK not set; alert skipped");
    }
  }

  console.log(
    JSON.stringify(
      {
        staleImportDays: STALE_IMPORT_DAYS,
        staleSources,
      },
      null,
      2,
    ),
  );

  // 有变化、访问失败或来源长期未导入时返回非零，方便定时任务触发告警。
  if (
    results.changed > 0 ||
    results.blocked > 0 ||
    results.unreachable > 0 ||
    staleSources.length > 0
  ) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
