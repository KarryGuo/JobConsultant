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
});

const CompanyFileSchema = z.object({
  company: CompanyInputSchema,
  signals: z.array(SignalInputSchema).min(1),
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
};

type Summary = {
  files: string[];
  companies: number;
  signalsCreated: number;
  signalsUpdated: number;
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
  };
}

async function upsertCompany(input: CompanyInput) {
  const normalized = normalizeCompanyName(input.name);
  const pinyinInitials = toPinyinInitials(input.name);
  const province = input.province ?? provinceForCity(input.city);
  const aliases = Array.from(
    new Set(
      [
        normalized,
        ...input.aliases.map((alias) => normalizeCompanyName(alias)),
      ].filter(Boolean),
    ),
  );

  return prisma.company.upsert({
    where: { normalized },
    update: {
      name: input.name,
      pinyinInitials,
      aliases,
      creditCode: input.creditCode ?? null,
      province,
      city: input.city ?? null,
      industry: input.industry ?? null,
      depth: input.depth,
    },
    create: {
      name: input.name,
      normalized,
      pinyinInitials,
      aliases,
      creditCode: input.creditCode ?? null,
      province,
      city: input.city ?? null,
      industry: input.industry ?? null,
      depth: input.depth,
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
    announcementContext = {
      sourceUrl: parsed.announcement.url,
      sourceTitle: parsed.announcement.title,
      sourcePublishedAt: parsed.announcement.publishedAt,
      fetchedAt: parsed.announcement.fetchedAt,
      snapshotFile: parsed.announcement.snapshotFile,
      sourceKey: source.key,
      reviewCycleDays: source.reviewCycleDays,
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
        snapshotPath: path.relative(process.cwd(), snapshotPath),
        sourceKey: resolved.sourceKey,
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
