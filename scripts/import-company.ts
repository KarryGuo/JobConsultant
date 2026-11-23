import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import type { SourceRegistry } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/db";
import { sha256File } from "../lib/evidence";
import { computeNextReviewAt, defaultReviewCycleDays } from "../lib/freshness";
import { provinceForCity } from "../lib/region";
import { normalizeCompanyName, toPinyinInitials } from "../lib/text";

const CompanyInputSchema = z.object({
  name: z.string().min(2),
  aliases: z.array(z.string()).default([]),
  creditCode: z.string().length(18).nullable().optional(),
  province: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  depth: z.number().int().min(0).max(1).default(0),
});

const SignalInputSchema = z.object({
  type: z.string().min(1),
  period: z.string().optional(),
  severity: z.enum(["high", "medium", "low"]),
  value: z.record(z.string(), z.unknown()),
  sourceUrl: z.string().url().optional(),
  sourceTitle: z.string().min(1).optional(),
  sourcePublishedAt: z.string().optional(),
  fetchedAt: z.string().optional(),
  // 可选覆盖默认复核周期（天）。未填时按来源注册表或信号类型取默认值。
  reviewCycleDays: z.number().int().min(1).max(365).optional(),
  sourceKey: z.string().optional(),
  snapshotFile: z.string().min(1).optional(),
  // 数据血缘：采集运行 ID 与解析器版本，由 ingest-announcements.ts 写入。
  ingestRunId: z.string().min(1).optional(),
  parserVersion: z.string().min(1).optional(),
});

const IngestRunSchema = z.object({
  id: z.string().min(1),
  sourceKey: z.string().min(1),
  sourceUrl: z.string().url(),
  parserVersion: z.string().min(1),
  status: z.enum(["success", "partial", "failed"]),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().optional(),
  httpStatus: z.number().int().nullable().optional(),
  contentHash: z.string().length(64).optional(),
  snapshotPath: z.string().min(1).optional(),
  warnings: z.number().int().min(0).default(0),
  errors: z.number().int().min(0).default(0),
  errorMessage: z.string().optional(),
  actor: z.string().optional(),
});

const CompanyFileSchema = z.object({
  company: CompanyInputSchema,
  // 允许只登记企业主体、暂无公开信号。此类档案用于让用户能查到公司，
  // 报告页会明确展示“主体已收录、暂未命中风险规则”，不代表安全。
  signals: z.array(SignalInputSchema).default([]),
});

const SourceSchema = z.object({
  key: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "source key must be lowercase letters, digits or -"),
  name: z.string().min(2),
  category: z.string().min(2),
  level: z.enum(["A", "B"]).default("A"),
  region: z.string().optional(),
  baseUrl: z.string().url().optional(),
  accessType: z.enum(["public_web", "api", "manual"]).default("public_web"),
  fetchMode: z.enum(["manual", "script"]).default("manual"),
  reviewCycleDays: z.number().int().min(1).max(365).default(30),
  enabled: z.boolean().default(true),
  notes: z.string().optional(),
});

const AnnouncementSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  publishedAt: z.string().optional(),
  fetchedAt: z.string().optional(),
  snapshotFile: z.string().min(1),
});

const AnnouncementFileSchema = z.object({
  source: SourceSchema,
  announcement: AnnouncementSchema,
  // 新采集脚本会写入本次运行的血缘记录；旧文件没有这个字段也能导入。
  ingestRun: IngestRunSchema.optional(),
  companies: z.array(CompanyFileSchema).min(1),
});

const BatchFileSchema = z.object({
  companies: z.array(CompanyFileSchema).min(1),
});

const ManifestSchema = z.object({
  files: z.array(z.string()).min(1),
});

const AnyFileSchema = z.union([
  ManifestSchema,
  AnnouncementFileSchema,
  BatchFileSchema,
  CompanyFileSchema,
]);

type SignalInput = z.infer<typeof SignalInputSchema>;
type CompanyInput = z.infer<typeof CompanyInputSchema>;

type AnnouncementContext = {
  sourceUrl: string;
  sourceTitle: string;
  sourcePublishedAt?: string;
  fetchedAt?: string;
  snapshotFile: string;
  sourceKey: string;
  reviewCycleDays: number;
  ingestRunId?: string;
  parserVersion?: string;
};

type ResolvedSignal = {
  signal: SignalInput;
  sourceUrl: string;
  sourceTitle: string;
  sourcePublishedAt?: string;
  fetchedAt?: string;
  snapshotFile: string;
  sourceKey: string;
  reviewCycleDays: number;
  ingestRunId?: string;
  parserVersion?: string;
};

type Summary = {
  files: string[];
  companies: number;
  signalsCreated: number;
  signalsUpdated: number;
  ingestRuns: number;
  errors: Array<{ file: string; message: string }>;
};

const registryByKey = new Map<string, SourceRegistry>();
const snapshotHashes = new Map<string, string>();
const touchedSourceKeys = new Set<string>();

function categoryForSignalType(type: string): string {
  switch (type) {
    case "labor_violation":
      return "labor_violation";
    case "court_exec":
      return "court_exec";
    case "hiring_anomaly":
      return "other";
    case "insured_drop":
      return "labor_violation";
    default:
      return "other";
  }
}

function originOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}/`;
  } catch {
    return null;
  }
}

async function loadRegistries(): Promise<void> {
  const rows = await prisma.sourceRegistry.findMany();
  for (const row of rows) registryByKey.set(row.key, row);
}

async function upsertRegistry(
  input: z.infer<typeof SourceSchema>,
): Promise<SourceRegistry> {
  const row = await prisma.sourceRegistry.upsert({
    where: { key: input.key },
    update: {
      name: input.name,
      category: input.category,
      level: input.level,
      region: input.region ?? null,
      baseUrl: input.baseUrl ?? null,
      accessType: input.accessType,
      fetchMode: input.fetchMode,
      reviewCycleDays: input.reviewCycleDays,
      enabled: input.enabled,
      notes: input.notes ?? null,
    },
    create: {
      key: input.key,
      name: input.name,
      category: input.category,
      level: input.level,
      region: input.region ?? null,
      baseUrl: input.baseUrl ?? null,
      accessType: input.accessType,
      fetchMode: input.fetchMode,
      reviewCycleDays: input.reviewCycleDays,
      enabled: input.enabled,
      notes: input.notes ?? null,
    },
  });

  registryByKey.set(row.key, row);
  return row;
}

function findRegistryByUrl(sourceUrl: string): SourceRegistry | null {
  for (const row of registryByKey.values()) {
    if (row.baseUrl && sourceUrl.startsWith(row.baseUrl)) return row;
  }
  return null;
}

async function registryForLegacySignal(
  signal: SignalInput & { sourceUrl: string; sourceTitle: string },
): Promise<SourceRegistry> {
  if (signal.sourceKey) {
    const explicit = registryByKey.get(signal.sourceKey);
    if (explicit) return explicit;
  }

  const byUrl = findRegistryByUrl(signal.sourceUrl);
  if (byUrl) return byUrl;

  const key = `auto-${createHash("sha256")
    .update(signal.sourceUrl)
    .digest("hex")
    .slice(0, 12)}`;

  const existing = registryByKey.get(key);
  if (existing) return existing;

  const row = await prisma.sourceRegistry.upsert({
    where: { key },
    update: {},
    create: {
      key,
      name: signal.sourceTitle,
      category: categoryForSignalType(signal.type),
      level: "B",
      region: null,
      baseUrl: originOf(signal.sourceUrl),
      accessType: "manual",
      fetchMode: "manual",
      reviewCycleDays: defaultReviewCycleDays(signal.type),
      enabled: true,
      notes: "由批量导入自动登记，待人工确认来源属性。",
    },
  });

  registryByKey.set(row.key, row);
  return row;
}

function resolveSignal(
  signal: SignalInput,
  context: AnnouncementContext,
): ResolvedSignal {
  const sourceUrl = signal.sourceUrl ?? context.sourceUrl;
  const sourceTitle = signal.sourceTitle ?? context.sourceTitle;
  const snapshotFile = signal.snapshotFile ?? context.snapshotFile;

  if (!sourceUrl || !sourceTitle || !snapshotFile) {
    throw new Error("signal is missing sourceUrl/sourceTitle/snapshotFile");
  }

  return {
    signal,
    sourceUrl,
    sourceTitle,
    sourcePublishedAt: signal.sourcePublishedAt ?? context.sourcePublishedAt,
    fetchedAt: signal.fetchedAt ?? context.fetchedAt,
    snapshotFile,
    sourceKey: signal.sourceKey ?? context.sourceKey,
    reviewCycleDays: signal.reviewCycleDays ?? context.reviewCycleDays,
    ingestRunId: signal.ingestRunId ?? context.ingestRunId,
    parserVersion: signal.parserVersion ?? context.parserVersion,
  };
}

async function upsertCompany(input: CompanyInput) {
  const normalized = normalizeCompanyName(input.name);
  const pinyinInitials = toPinyinInitials(input.name);
  const province = input.province ?? provinceForCity(input.city);
  const city = input.city ?? null;
  const regionKey = `${province ?? ""}|${city ?? ""}`;
  const aliases = Array.from(
    new Set(
      [
        normalized,
        ...input.aliases.map((alias) => normalizeCompanyName(alias)),
      ].filter(Boolean),
    ),
  );

  // 信用代码优先：公司改名后仍能命中同一主体。
  const byCode = input.creditCode
    ? await prisma.company.findUnique({
        where: { creditCode: input.creditCode },
        select: { id: true },
      })
    : null;

  const byName = byCode
    ? null
    : await prisma.company.findUnique({
        where: { normalized_regionKey: { normalized, regionKey } },
        select: { id: true, creditCode: true },
      });

  // 同名同地区但信用代码不同，说明是两家不同主体。
  // 这时宁可让导入失败，也不能把两条记录合并或覆盖。
  if (
    byName &&
    input.creditCode &&
    byName.creditCode &&
    byName.creditCode !== input.creditCode
  ) {
    throw new Error(
      `同名企业冲突：${input.name}（${regionKey}）已有信用代码 ${byName.creditCode}，本次为 ${input.creditCode}`,
    );
  }

  const data = {
    name: input.name,
    normalized,
    regionKey,
    pinyinInitials,
    aliases,
    // 未提供信用代码时保留已有值，避免主体档案重导入把已核验信息清空。
    ...(input.creditCode ? { creditCode: input.creditCode } : {}),
    province,
    city,
    industry: input.industry ?? null,
    depth: input.depth,
  };

  if (byCode) {
    return prisma.company.update({ where: { id: byCode.id }, data });
  }

  if (byName) {
    return prisma.company.update({ where: { id: byName.id }, data });
  }

  return prisma.company.create({
    data: {
      ...data,
      creditCode: input.creditCode ?? null,
    },
  });
}

async function importFile(file: string, summary: Summary): Promise<void> {
  const raw = JSON.parse(await readFile(file, "utf8"));
  const parsed = AnyFileSchema.parse(raw);

  if ("files" in parsed) {
    throw new Error("manifest should be expanded before import");
  }

  let entries: z.infer<typeof CompanyFileSchema>[];
  let announcementContext: AnnouncementContext | null = null;

  if ("source" in parsed) {
    const source = await upsertRegistry(parsed.source);
    let ingestRunId: string | undefined;
    let parserVersion: string | undefined;

    if (parsed.ingestRun) {
      const run = parsed.ingestRun;

      if (run.sourceKey !== source.key) {
        throw new Error(
          `ingestRun sourceKey mismatch: ${run.sourceKey} !== ${source.key}`,
        );
      }

      const runData = {
        sourceKey: run.sourceKey,
        sourceUrl: run.sourceUrl,
        parserVersion: run.parserVersion,
        status: run.status,
        startedAt: new Date(run.startedAt),
        finishedAt: run.finishedAt ? new Date(run.finishedAt) : null,
        httpStatus: run.httpStatus ?? null,
        contentHash: run.contentHash ?? null,
        snapshotPath: run.snapshotPath ?? null,
        warnings: run.warnings,
        errors: run.errors,
        errorMessage: run.errorMessage ?? null,
        actor: run.actor ?? null,
      };

      await prisma.ingestRun.upsert({
        where: { id: run.id },
        update: runData,
        create: { id: run.id, ...runData },
      });

      ingestRunId = run.id;
      parserVersion = run.parserVersion;
      summary.ingestRuns += 1;
    }

    announcementContext = {
      sourceUrl: parsed.announcement.url,
      sourceTitle: parsed.announcement.title,
      sourcePublishedAt: parsed.announcement.publishedAt,
      fetchedAt: parsed.announcement.fetchedAt,
      snapshotFile: parsed.announcement.snapshotFile,
      sourceKey: source.key,
      reviewCycleDays: source.reviewCycleDays,
      ingestRunId,
      parserVersion,
    };
    entries = parsed.companies;
  } else if ("companies" in parsed) {
    entries = parsed.companies;
  } else {
    entries = [parsed];
  }

  for (const entry of entries) {
    const company = await upsertCompany(entry.company);
    summary.companies += 1;

    for (const rawSignal of entry.signals) {
      let resolved: ResolvedSignal;

      if (announcementContext) {
        resolved = resolveSignal(rawSignal, announcementContext);
      } else {
        if (
          !rawSignal.sourceUrl ||
          !rawSignal.sourceTitle ||
          !rawSignal.snapshotFile
        ) {
          throw new Error(
            `legacy signal of ${entry.company.name} is missing sourceUrl/sourceTitle/snapshotFile`,
          );
        }

        const registry = await registryForLegacySignal({
          ...rawSignal,
          sourceUrl: rawSignal.sourceUrl,
          sourceTitle: rawSignal.sourceTitle,
        });

        resolved = resolveSignal(rawSignal, {
          sourceUrl: rawSignal.sourceUrl,
          sourceTitle: rawSignal.sourceTitle,
          sourcePublishedAt: rawSignal.sourcePublishedAt,
          fetchedAt: rawSignal.fetchedAt,
          snapshotFile: rawSignal.snapshotFile,
          sourceKey: registry.key,
          reviewCycleDays: registry.reviewCycleDays,
        });
      }

      const snapshotPath = path.resolve(process.cwd(), resolved.snapshotFile);
      let snapshotHash = snapshotHashes.get(snapshotPath);
      if (!snapshotHash) {
        snapshotHash = await sha256File(snapshotPath);
        snapshotHashes.set(snapshotPath, snapshotHash);
      }

      const period = resolved.signal.period ?? null;
      const existing = await prisma.signal.findFirst({
        where: {
          companyId: company.id,
          type: resolved.signal.type,
          sourceUrl: resolved.sourceUrl,
          period,
        },
      });

      // 重新导入未提供 fetchedAt 时保留原抓取时间，
      // 避免把“重新读取同一份快照”误写成“刚刚重新核验过”。
      const fetchedAt = resolved.fetchedAt
        ? new Date(resolved.fetchedAt)
        : (existing?.fetchedAt ?? new Date());
      const candidateVerifiedAt = resolved.fetchedAt
        ? fetchedAt
        : (existing?.fetchedAt ?? fetchedAt);
      // 不让一次旧公告的重导入把更晚的人工复核时间回退。
      const lastVerifiedAt =
        existing?.lastVerifiedAt &&
        existing.lastVerifiedAt.getTime() > candidateVerifiedAt.getTime()
          ? existing.lastVerifiedAt
          : candidateVerifiedAt;
      const nextReviewAt = computeNextReviewAt(
        lastVerifiedAt,
        resolved.reviewCycleDays,
      );

      const data = {
        companyId: company.id,
        type: resolved.signal.type,
        period,
        value: resolved.signal.value as Prisma.InputJsonValue,
        severity: resolved.signal.severity,
        sourceUrl: resolved.sourceUrl,
        sourceTitle: resolved.sourceTitle,
        sourcePublishedAt: resolved.sourcePublishedAt
          ? new Date(resolved.sourcePublishedAt)
          : null,
        fetchedAt,
        snapshotHash,
        // 统一存 POSIX 分隔符，保证 Windows 导入、Linux 运行都能解析。
        snapshotPath: path
          .relative(process.cwd(), snapshotPath)
          .split(path.sep)
          .join("/"),
        sourceKey: resolved.sourceKey,
        // 旧文件重导入时不要清空已有血缘；新文件则写入本次运行。
        ...(resolved.ingestRunId
          ? { ingestRunId: resolved.ingestRunId }
          : {}),
        ...(resolved.parserVersion
          ? { parserVersion: resolved.parserVersion }
          : {}),
        lastVerifiedAt,
        reviewCycleDays: resolved.reviewCycleDays,
        nextReviewAt,
      };

      if (existing) {
        await prisma.signal.update({ where: { id: existing.id }, data });
        summary.signalsUpdated += 1;
      } else {
        await prisma.signal.create({ data });
        summary.signalsCreated += 1;
      }

      touchedSourceKeys.add(resolved.sourceKey);

      await prisma.sourceHealth.upsert({
        where: { sourceUrl: resolved.sourceUrl },
        update: { sourceTitle: resolved.sourceTitle },
        create: {
          sourceUrl: resolved.sourceUrl,
          sourceTitle: resolved.sourceTitle,
          status: "unknown",
        },
      });
    }
  }
}

async function expandPaths(input: string): Promise<string[]> {
  const absolute = path.resolve(process.cwd(), input);
  const info = await stat(absolute);

  if (info.isDirectory()) {
    const entries = (await readdir(absolute))
      .filter((name) => name.toLowerCase().endsWith(".json"))
      .sort();
    const files: string[] = [];
    for (const entry of entries) {
      files.push(...(await expandPaths(path.join(absolute, entry))));
    }
    return files;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(absolute, "utf8"));
  } catch {
    // 非法 JSON 交给 importFile 报错，避免一个坏文件中断整个批次。
    return [absolute];
  }

  const manifest = ManifestSchema.safeParse(raw);
  if (manifest.success) {
    const files: string[] = [];
    for (const file of manifest.data.files) {
      files.push(...(await expandPaths(path.resolve(path.dirname(absolute), file))));
    }
    return files;
  }

  return [absolute];
}

async function defaultInput(): Promise<string> {
  const manifest = path.resolve(process.cwd(), "data/import-manifest.json");
  try {
    await stat(manifest);
    return manifest;
  } catch {
    return path.resolve(process.cwd(), "data/companies/shaanxi-zhitu.json");
  }
}

async function main() {
  await loadRegistries();

  const args = process.argv.slice(2);
  const inputs = args.length > 0 ? args : [await defaultInput()];

  const files: string[] = [];
  const expansionErrors: Array<{ file: string; message: string }> = [];

  for (const input of inputs) {
    try {
      files.push(...(await expandPaths(input)));
    } catch (error) {
      expansionErrors.push({
        file: input,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const uniqueFiles = Array.from(new Set(files));
  const summary: Summary = {
    files: uniqueFiles.map((file) => path.relative(process.cwd(), file)),
    companies: 0,
    signalsCreated: 0,
    signalsUpdated: 0,
    ingestRuns: 0,
    errors: [...expansionErrors],
  };

  for (const file of uniqueFiles) {
    try {
      await importFile(file, summary);
    } catch (error) {
      summary.errors.push({
        file: path.relative(process.cwd(), file),
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (touchedSourceKeys.size > 0) {
    await prisma.sourceRegistry.updateMany({
      where: { key: { in: Array.from(touchedSourceKeys) } },
      data: { lastImportedAt: new Date() },
    });
  }

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

  if (summary.errors.length > 0) {
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
