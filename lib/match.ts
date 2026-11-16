import { prisma } from "./db";
import { normalizeCompanyName, toPinyinInitials } from "./text";

export type CompanySummary = {
  id: string;
  name: string;
  province: string | null;
  city: string | null;
  industry: string | null;
  status: string | null;
  depth: number;
};

export type CompanySuggestion = CompanySummary & {
  score: number;
  reason: "exact" | "prefix" | "contains" | "pinyin" | "similar";
};

export type MatchResult =
  | { kind: "hit"; company: CompanySummary }
  | { kind: "candidates"; candidates: CompanySummary[] }
  | { kind: "miss" };

const SUMMARY_SELECT = {
  id: true,
  name: true,
  province: true,
  city: true,
  industry: true,
  status: true,
  depth: true,
} as const;

function toSummary(company: CompanySummary): CompanySummary {
  return {
    id: company.id,
    name: company.name,
    province: company.province,
    city: company.city,
    industry: company.industry,
    status: company.status,
    depth: company.depth,
  };
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      );
    }
    previous = current;
  }

  return previous[b.length];
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;

  if (a.includes(b) || b.includes(a)) {
    const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
    return 0.8 + 0.2 * ratio;
  }

  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

/**
 * 三级匹配：
 * L1 信用代码 / 归一化名称 / 别名精确命中
 * L2 拼音首字母
 * L3 包含 + 编辑距离（当前量级直接内存扫描；上千家后换 pg_trgm）
 */
export async function matchCompany(raw: string): Promise<MatchResult> {
  const input = raw.trim();
  if (!input) return { kind: "miss" };

  const normalized = normalizeCompanyName(input);
  if (!normalized) return { kind: "miss" };

  const creditCode = input.toUpperCase().replace(/\s/g, "");
  if (/^[0-9A-Z]{18}$/.test(creditCode)) {
    const byCode = await prisma.company.findUnique({
      where: { creditCode },
      select: SUMMARY_SELECT,
    });
    if (byCode) return { kind: "hit", company: byCode };
  }

  const exact = await prisma.company.findUnique({
    where: { normalized },
    select: SUMMARY_SELECT,
  });
  if (exact) return { kind: "hit", company: exact };

  const byAlias = await prisma.company.findFirst({
    where: { aliases: { has: normalized } },
    select: SUMMARY_SELECT,
  });
  if (byAlias) return { kind: "hit", company: byAlias };

  const isAsciiInput = /^[a-z0-9]+$/.test(normalized);
  const initials = isAsciiInput ? normalized : toPinyinInitials(normalized);

  const all = await prisma.company.findMany({
    select: { ...SUMMARY_SELECT, normalized: true, pinyinInitials: true },
  });

  // 拼音匹配只用于用户输入字母（如 zt / zjtd）。
  // 中文输入若也走首字母，会匹配到大量无关公司。
  if (isAsciiInput && initials.length >= 2) {
    const exactPinyin = all.filter(
      (company) => company.pinyinInitials === initials,
    );
    if (exactPinyin.length === 1) {
      return { kind: "hit", company: toSummary(exactPinyin[0]) };
    }
    if (exactPinyin.length > 1) {
      return {
        kind: "candidates",
        candidates: exactPinyin.slice(0, 5).map(toSummary),
      };
    }

    // 长公司名的完整首字母很难被用户完整输入；
    // 允许用户输入其中一段（如「zt」命中「陕西知途科技互联网」）。
    const partialPinyin = all.filter((company) =>
      company.pinyinInitials?.includes(initials),
    );
    if (partialPinyin.length === 1) {
      return { kind: "hit", company: toSummary(partialPinyin[0]) };
    }
    if (partialPinyin.length > 1) {
      return {
        kind: "candidates",
        candidates: partialPinyin.slice(0, 5).map(toSummary),
      };
    }
  }

  const scored = all
    .map((company) => ({
      company,
      score: similarity(normalized, company.normalized),
    }))
    .filter((item) => item.score >= 0.6)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (scored.length === 0) return { kind: "miss" };

  if (
    scored.length === 1 ||
    (scored[0].score >= 0.85 && scored[0].score - scored[1].score >= 0.1)
  ) {
    return { kind: "hit", company: toSummary(scored[0].company) };
  }

  return {
    kind: "candidates",
    candidates: scored.map((item) => toSummary(item.company)),
  };
}

/**
 * 输入联想：返回按相关度排序的候选，不做自动选择。
 * 当前量级全量扫描；上千家后应改为数据库前缀/trigram 索引。
 */
export async function suggestCompanies(
  raw: string,
  limit = 8,
): Promise<CompanySuggestion[]> {
  const input = raw.trim();
  if (!input) return [];

  const normalized = normalizeCompanyName(input);
  if (!normalized) return [];

  const isAsciiInput = /^[a-z0-9]+$/.test(normalized);
  const initials = isAsciiInput ? normalized : toPinyinInitials(normalized);

  const all = await prisma.company.findMany({
    select: {
      ...SUMMARY_SELECT,
      normalized: true,
      pinyinInitials: true,
      aliases: true,
      creditCode: true,
    },
  });

  const scored: Array<{
    company: CompanySummary;
    score: number;
    reason: CompanySuggestion["reason"];
  }> = [];

  for (const company of all) {
    let score = 0;
    let reason: CompanySuggestion["reason"] = "similar";

    if (
      company.normalized === normalized ||
      company.aliases.includes(normalized) ||
      company.creditCode?.toLowerCase() === normalized
    ) {
      score = 1;
      reason = "exact";
    } else if (company.normalized.startsWith(normalized)) {
      score = 0.97;
      reason = "prefix";
    } else if (company.normalized.includes(normalized)) {
      score = 0.94;
      reason = "contains";
    } else if (
      isAsciiInput &&
      initials.length >= 2 &&
      company.pinyinInitials
    ) {
      if (company.pinyinInitials === initials) {
        score = 0.95;
        reason = "pinyin";
      } else if (company.pinyinInitials.startsWith(initials)) {
        score = 0.9;
        reason = "pinyin";
      } else if (company.pinyinInitials.includes(initials)) {
        score = 0.82;
        reason = "pinyin";
      }
    }

    if (score === 0) {
      const similarityScore = similarity(normalized, company.normalized);
      if (similarityScore >= 0.5) {
        score = similarityScore * 0.9;
        reason = "similar";
      }
    }

    if (score > 0) {
      scored.push({ company: toSummary(company), score, reason });
    }
  }

  return scored
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.company.name.localeCompare(right.company.name, "zh-CN"),
    )
    .slice(0, limit)
    .map((item) => ({
      ...item.company,
      score: item.score,
      reason: item.reason,
    }));
}
