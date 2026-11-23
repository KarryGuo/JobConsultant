import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";

/**
 * 按来源或单条信号撤回公开记录。
 *
 * 用途：
 * - 官方公告被撤稿、更正或发现解析错误；
 * - 需要把某次采集运行影响的记录整体下线；
 * - 需要清理受影响公司的报告缓存，强制重新生成。
 *
 * 只追加审计事件，不删除信号本身；这样仍能追溯“曾经发布过什么、为什么撤回”。
 */

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length).trim();

  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

async function main() {
  const sourceKey = readArg("source-key");
  const signalId = readArg("signal-id");
  const reason = readArg("reason");
  const actor = readArg("actor") ?? "cli:retract-source";
  const dryRun = process.argv.includes("--dry-run");
  const purgeReports = process.argv.includes("--purge-reports");

  if (!sourceKey && !signalId) {
    throw new Error("必须提供 --source-key 或 --signal-id");
  }
  if (!reason || reason.length < 5) {
    throw new Error("必须提供至少 5 个字符的 --reason，说明撤回依据");
  }

  const where: Prisma.SignalWhereInput = {
    invalidatedAt: null,
    ...(sourceKey ? { sourceKey } : {}),
    ...(signalId ? { id: signalId } : {}),
  };

  const signals = await prisma.signal.findMany({
    where,
    select: {
      id: true,
      companyId: true,
      type: true,
      sourceKey: true,
      sourceUrl: true,
      sourceTitle: true,
      period: true,
    },
    orderBy: [{ companyId: "asc" }, { id: "asc" }],
  });

  const companyIds = Array.from(
    new Set(signals.map((signal) => signal.companyId)),
  );

  const summary = {
    dryRun,
    sourceKey: sourceKey ?? null,
    signalId: signalId ?? null,
    signals: signals.length,
    companies: companyIds.length,
    purgeReports,
    reason,
    actor,
  };

  if (signals.length === 0) {
    process.stdout.write(`${JSON.stringify({ ...summary, changed: 0 }, null, 2)}\n`);
    return;
  }

  if (dryRun) {
    process.stdout.write(
      `${JSON.stringify(
        {
          ...summary,
          changed: 0,
          preview: signals.slice(0, 20),
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const now = new Date();

  await prisma.$transaction([
    ...signals.map((signal) =>
      prisma.signal.update({
        where: { id: signal.id },
        data: {
          invalidatedAt: now,
          correctedAt: now,
          correctionNote: reason.slice(0, 500),
        },
      }),
    ),
    ...signals.map((signal) =>
      prisma.signalAuditEvent.create({
        data: {
          signalId: signal.id,
          sourceKey: signal.sourceKey,
          action: "source_retracted",
          actor,
          note: reason.slice(0, 500),
        },
      }),
    ),
  ]);

  let deletedReports = 0;
  if (purgeReports) {
    const deleted = await prisma.report.deleteMany({
      where: { companyId: { in: companyIds } },
    });
    deletedReports = deleted.count;
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ...summary,
        changed: signals.length,
        deletedReports,
        completedAt: now.toISOString(),
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
