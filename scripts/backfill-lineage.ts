import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../lib/db";

/**
 * 给历史手工导入的信号补采集血缘。
 *
 * 新数据由 ingest-announcements.ts 写入 ingestRun；早期陕西数据没有这个字段。
 * 这里按 sourceKey + sourceUrl + snapshotPath 分组，生成一次“历史回填”运行记录，
 * 并只更新 ingestRunId 为空的信号。脚本可重复执行。
 */

async function main() {
  const signals = await prisma.signal.findMany({
    where: {
      ingestRunId: null,
      snapshotPath: { not: null },
    },
    select: {
      id: true,
      sourceKey: true,
      sourceUrl: true,
      sourceTitle: true,
      snapshotPath: true,
      fetchedAt: true,
    },
    orderBy: { fetchedAt: "asc" },
  });

  const groups = new Map<
    string,
    {
      sourceKey: string;
      sourceUrl: string;
      snapshotPath: string;
      signals: typeof signals;
    }
  >();

  for (const signal of signals) {
    if (!signal.snapshotPath) continue;
    const key = `${signal.sourceKey ?? "unknown"}|${signal.sourceUrl}|${signal.snapshotPath}`;
    const group = groups.get(key);
    if (group) {
      group.signals.push(signal);
    } else {
      groups.set(key, {
        sourceKey: signal.sourceKey ?? "legacy-manual",
        sourceUrl: signal.sourceUrl,
        snapshotPath: signal.snapshotPath,
        signals: [signal],
      });
    }
  }

  const runs: Array<{
    id: string;
    sourceKey: string;
    signals: number;
    contentHash: string;
  }> = [];

  for (const group of groups.values()) {
    const absolute = path.resolve(
      process.cwd(),
      group.snapshotPath.replace(/\\/g, "/"),
    );
    let contentHash = "";

    try {
      const content = await readFile(absolute);
      contentHash = createHash("sha256").update(content).digest("hex");
    } catch {
      console.warn(`skip missing snapshot: ${group.snapshotPath}`);
      continue;
    }

    const startedAt = group.signals[0]?.fetchedAt ?? new Date();
    const finishedAt =
      group.signals[group.signals.length - 1]?.fetchedAt ?? startedAt;

    const run = await prisma.ingestRun.create({
      data: {
        id: randomUUID(),
        sourceKey: group.sourceKey,
        sourceUrl: group.sourceUrl,
        parserVersion: "legacy-backfill-2026-11-22",
        status: "success",
        startedAt,
        finishedAt,
        httpStatus: null,
        contentHash,
        snapshotPath: group.snapshotPath,
        warnings: 0,
        errors: 0,
        actor: "scripts/backfill-lineage.ts",
      },
    });

    await prisma.signal.updateMany({
      where: { id: { in: group.signals.map((signal) => signal.id) } },
      data: {
        ingestRunId: run.id,
        parserVersion: run.parserVersion,
      },
    });

    runs.push({
      id: run.id,
      sourceKey: group.sourceKey,
      signals: group.signals.length,
      contentHash,
    });
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        backfilledSignals: runs.reduce((sum, run) => sum + run.signals, 0),
        runs,
      },
      null,
      2,
    )}\n`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
