"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * 全局错误边界：数据库不可达、服务端渲染失败时，用户看到的不再是白屏，
 * 而是一页明确的提示与重试入口。error.tsx 覆盖所有没有自定义边界的路由。
 */
export default function GlobalErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl pb-24 pt-20">
      <p className="font-mono text-[10px] tracking-[0.2em] text-accent">
        服务异常 / ERROR
      </p>
      <h1 className="mt-3 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
        查询暂时不可用
      </h1>
      <p className="mt-4 text-sm leading-7 text-muted">
        数据检索服务没有响应，通常几秒内就会恢复。你可以稍后重试。
        也请记住：任何一次「查不到」都不代表公司安全，也不代表公司有问题。
      </p>
      {error.digest ? (
        <p className="mt-3 font-mono text-[10px] text-muted">
          错误编号 {error.digest}
        </p>
      ) : null}
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <button
          onClick={reset}
          className="inline-flex h-10 items-center bg-ink px-5 text-sm font-medium text-paper transition hover:bg-accent"
        >
          重试
        </button>
        <Link
          href="/"
          className="text-sm text-muted underline underline-offset-4 transition hover:text-ink"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
}
