import { prisma } from "../lib/db";
import { getCompanyReport } from "../lib/report-service";

/**
 * 预热报告缓存：导入/规则变更后运行，避免第一位访客等待模型生成。
 *
 * 用法：
 *   pnpm prewarm:reports
 *   pnpm prewarm:reports -- --limit 20
 *   pnpm prewarm:reports -- --company 河南中省
 *   pnpm prewarm:reports -- --dry-run
 */

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length).trim();

  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1]?.trim() : undefined;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const limitArg = readArg("limit");
  const limit = limitArg ? Number(limitArg) : undefined;
  const company = readArg("company");

  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error("--limit 必须是正整数");
  }

  const companies = await prisma.company.findMany({
    where: {
      signals: { some: {} },
      ...(company
        ? {
            OR: [
              { id: company },
              { name: { contains: company } },
              { normalized: { contains: company } },
            ],
          }
        : {}),
    },
    select: { id: true, name: true },
    orderBy: { updatedAt: "desc" },
    ...(limit ? { take: limit } : {}),
  });

  process.stdout.write(`prewarm companies: ${companies.length}\n`);

  if (dryRun) {
    process.stdout.write(
      `${JSON.stringify(
        companies.map((item) => ({ id: item.id, name: item.name })),
        null,
        2,
      )}\n`,
    );
    return;
  }

  const queue = [...companies];
  const concurrency = Math.min(2, Math.max(1, companies.length));
  const results: Array<{
    name: string;
    modelVersion: string;
    status: string;
  }> = [];
  const failures: Array<{ name: string; error: string }> = [];

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;

      try {
        const result = await getCompanyReport(item.id);
        if (!result) throw new Error("company not found");
        results.push({
          name: item.name,
          modelVersion: result.report.modelVersion,
          status: result.report.status,
        });
        process.stdout.write(
          `PASS ${item.name}\t${result.report.modelVersion}\t${result.report.status}\n`,
        );
      } catch (error) {
        failures.push({
          name: item.name,
          error: error instanceof Error ? error.message : String(error),
        });
        process.stdout.write(
          `FAIL ${item.name}\t${error instanceof Error ? error.message : String(error)}\n`,
        );
      }
    }
  }

  await Promise.all(
    Array.from({ length: concurrency }, () => worker()),
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        total: companies.length,
        ok: results.length,
        failed: failures.length,
        failures,
      },
      null,
      2,
    )}\n`,
  );

  if (failures.length > 0) {
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
