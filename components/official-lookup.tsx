"use client";

import { useState } from "react";

const OFFICIAL_LINKS = [
  {
    name: "国家企业信用信息公示系统",
    hint: "工商登记、年报、经营异常",
    href: "https://www.gsxt.gov.cn/index.html",
  },
  {
    name: "信用中国",
    hint: "行政处罚、信用档案",
    href: "https://www.creditchina.gov.cn/",
  },
  {
    name: "中国执行信息公开网",
    hint: "被执行人、失信、限制消费",
    href: "https://zxgk.court.gov.cn/",
  },
];

/**
 * 官方原始查询入口。职顾问不替代官方系统，
 * 这里提供一键复制公司名，方便用户到权威来源自行核验。
 */
export function OfficialLookup({
  companyName,
  compact = false,
}: {
  companyName: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copyName() {
    try {
      await navigator.clipboard.writeText(companyName);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      className={`border border-line bg-white/70 ${
        compact ? "px-4 py-3" : "px-5 py-4"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[10px] tracking-[0.18em] text-accent">
          官方原始查询 / OFFICIAL
        </p>
        <button
          type="button"
          onClick={copyName}
          className="border border-line px-3 py-1 font-mono text-[10px] text-muted transition hover:border-ink/40 hover:text-ink"
        >
          {copied ? "已复制公司名" : "复制公司名"}
        </button>
      </div>
      <p className="mt-2 text-xs leading-6 text-muted">
        官方系统是权威来源，通常需要验证码或登录。我们做的是二次整理，
        不替代官方；涉及法律判断时请以官方原文为准。
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {OFFICIAL_LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noreferrer noopener"
            className="border border-line px-3 py-2 transition hover:border-accent/50 hover:bg-accent-soft/40"
          >
            <span className="block text-xs font-medium text-ink">
              {link.name} ↗
            </span>
            <span className="mt-0.5 block font-mono text-[9px] text-muted">
              {link.hint}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
