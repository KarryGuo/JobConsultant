import { readFile } from "node:fs/promises";
import path from "node:path";

const SNAPSHOT_ROOT = path.resolve(process.cwd(), "data/snapshots");
const MAX_SNAPSHOT_CHARS = 200_000;

function decodeHtml(input: string): string {
  return input
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&emsp;|&#8195;/gi, " ")
    .replace(/&ensp;|&#8194;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, value: string) =>
      String.fromCodePoint(Number(value)),
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, value: string) =>
      String.fromCodePoint(parseInt(value, 16)),
    );
}

/**
 * 公告表格常把数字拆进多个 span，转纯文本后会留下 `15 4 .0978`。
 * 这里只修补“数字-空格-数字”和“数字-空格-小数点”，不改变文字顺序。
 */
function normalizeNumericText(input: string): string {
  let current = input;

  for (let index = 0; index < 3; index += 1) {
    current = current
      // 只在同一行内修补，避免把相邻日期的换行吞掉。
      .replace(/(\d)[ \t]*\.[ \t]*(\d)/g, "$1.$2")
      .replace(/(\d)[ \t]+(\d)/g, "$1$2");
  }

  return current;
}

function toPlainText(html: string): string {
  const text = decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<(?:br|\/p|\/div|\/li|\/tr|\/h[1-6])\s*\/?>/gi, "\n"),
  )
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t\u00a0]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .join("\n");

  return normalizeNumericText(text).slice(0, MAX_SNAPSHOT_CHARS);
}

/**
 * 只读取 data/snapshots 下的快照，并转成纯文本。
 * 返回 null 表示路径不安全、文件不存在或读取失败。
 */
export async function readSnapshotText(
  snapshotPath: string | null,
): Promise<string | null> {
  if (!snapshotPath) return null;

  // 数据库里的历史快照路径可能来自 Windows（反斜杠），
  // 而生产运行在 Linux；统一转成 POSIX 分隔符再解析。
  const resolved = path.resolve(
    process.cwd(),
    snapshotPath.replace(/\\/g, "/"),
  );
  if (
    resolved !== SNAPSHOT_ROOT &&
    !resolved.startsWith(`${SNAPSHOT_ROOT}${path.sep}`)
  ) {
    return null;
  }

  try {
    const raw = await readFile(resolved, "utf8");
    const text = toPlainText(raw);
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}
