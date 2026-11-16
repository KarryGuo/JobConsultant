import { pinyin } from "pinyin-pro";

const LEGAL_SUFFIXES = [
  "有限责任公司",
  "股份有限公司",
  "集团有限公司",
  "有限公司",
  "分公司",
  "集团",
  "公司",
];

/**
 * 生成检索键：全半角统一、去空格、去标点、去公司后缀。
 * 只用于匹配，不用于展示。
 */
export function normalizeCompanyName(input: string): string {
  let value = input.normalize("NFKC").toLowerCase().trim();
  value = value.replace(/\s+/g, "");
  value = value.replace(/[（）()［］\[\]【】《》<>·・.,，。、"“”'‘’：:；;！!？?\-—_/\\|]/g, "");

  for (const suffix of LEGAL_SUFFIXES) {
    if (value.endsWith(suffix)) {
      value = value.slice(0, -suffix.length);
      break;
    }
  }

  return value;
}

/**
 * 将公司名转成拼音首字母。例：字节跳动 -> zjtd。
 * 非中文与数字会被保留，最终只留下 a-z0-9。
 */
export function toPinyinInitials(input: string): string {
  const letters = pinyin(input, {
    pattern: "first",
    toneType: "none",
    type: "array",
  });

  return letters.join("").toLowerCase().replace(/[^a-z0-9]/g, "");
}
