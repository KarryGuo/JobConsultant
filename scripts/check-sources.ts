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

  if (problems.length > 0) {
    const webhook = process.env.SOURCE_ALERT_WEBHOOK?.trim();

    if (dryRun) {
      console.log(JSON.stringify(buildSourceAlertPayload(problems), null, 2));
    } else if (webhook) {
      const result = await sendSourceAlert(webhook, problems);
      console.log(
        result.ok
          ? `alert sent: ${problems.length} source(s)`
          : `alert failed: ${result.error}`,
      );
    } else {
      console.log("SOURCE_ALERT_WEBHOOK not set; alert skipped");
    }
  }

  // 有变化或访问失败时返回非零，方便定时任务触发告警。
  if (results.changed > 0 || results.blocked > 0 || results.unreachable > 0) {
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
