"use client";

import { useEffect, useRef, useState } from "react";

const SCENES = [
  () => (
    <>
      三个月。四轮面试。
      <br className="sm:hidden" />
      一个 offer。
    </>
  ),
  () => (
    <>
      入职前一周，
      <br className="sm:hidden" />
      <span className="whitespace-nowrap text-lime">岗位没了</span>。
    </>
  ),
  () => (
    <>
      招聘启事不会写，
      <br className="sm:hidden" />
      <span className="whitespace-nowrap text-lime">公开记录会</span>。
    </>
  ),
];

export function CinematicIntro({
  show,
  stats,
}: {
  show: boolean;
  stats: { companies: number; signals: number };
}) {
  const [visible, setVisible] = useState(show);
  const [scene, setScene] = useState(show ? 0 : 3);
  const [closing, setClosing] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const dismissRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!show) return;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      const timer = window.setTimeout(() => setScene(3), 0);
      return () => {
        window.clearTimeout(timer);
        document.body.style.overflow = "";
        document.documentElement.style.overflow = "";
      };
    }

    const timers = [2200, 4400, 6600].map((ms, index) =>
      window.setTimeout(() => setScene(index + 1), ms),
    );
    const focusTimer = window.setTimeout(
      () => dialogRef.current?.focus(),
      100,
    );
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissRef.current();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, [show]);

  function dismiss(focusSearch = false) {
    if (closing) return;
    setClosing(true);
    document.cookie = "zgw_intro_seen=1; path=/; max-age=2592000; SameSite=Lax";
    if (new URLSearchParams(window.location.search).has("intro")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    window.setTimeout(() => {
      setVisible(false);
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
      if (focusSearch) {
        document.getElementById("company-search")?.focus();
      }
    }, 600);
  }

  useEffect(() => {
    dismissRef.current = dismiss;
  });

  if (!visible) return null;

  const isFinal = scene >= 3;

  return (
    <div
      ref={dialogRef}
      data-cinematic-intro
      role="dialog"
      aria-modal="true"
      aria-label="职顾问开场"
      tabIndex={-1}
      className={`fixed inset-0 z-[100] flex flex-col overflow-hidden bg-[#050505] text-paper outline-none transition-opacity duration-[600ms] ${
        closing ? "opacity-0" : "opacity-100"
      }`}
    >
      <noscript>
        <style>{`[data-cinematic-intro]{display:none!important}`}</style>
      </noscript>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.85))]"
      />
      <div className="relative z-10 flex items-center justify-between px-5 py-4 sm:px-8">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center border border-paper/30 font-serif text-[12px] text-paper/80">
            档
          </span>
          <span className="font-mono text-[9px] tracking-[0.22em] text-paper/40">
            职顾问 / 求职调查
          </span>
        </div>
        <button
          type="button"
          onClick={() => dismiss(false)}
          className="border border-paper/20 px-3 py-1.5 font-mono text-[10px] tracking-[0.16em] text-paper/50 transition hover:border-lime hover:text-lime"
        >
          跳过
        </button>
      </div>

      <div className="relative z-10 flex flex-1 items-center px-5 sm:px-8">
        <div className="relative mx-auto h-[38vh] w-full max-w-5xl">
          {isFinal ? (
            <div className="intro-final absolute inset-0 flex flex-col justify-center">
              <p className="font-mono text-[10px] tracking-[0.26em] text-lime">
                求职调查 / VOL. 01
              </p>
              <h1 className="mt-3 font-serif text-[clamp(3rem,8vw,6.5rem)] font-semibold leading-none tracking-[-0.03em]">
                职顾问
              </h1>
              <p className="mt-4 font-serif text-xl text-paper/70 sm:text-2xl">
                offer 之前，先看一眼。
              </p>

              <div className="mt-8 flex flex-col gap-5 border-t border-paper/15 pt-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="font-serif text-4xl leading-none sm:text-5xl">
                    {stats.companies}
                    <span className="ml-2 text-xl font-normal sm:text-2xl">
                      家企业
                    </span>
                  </p>
                  <p className="mt-2 font-mono text-[9px] tracking-[0.14em] text-paper/40 sm:text-[10px]">
                    {stats.signals} 条公开记录 · 每条都能点回原文
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => dismiss(true)}
                  className="inline-flex h-12 items-center justify-center bg-lime px-6 text-sm font-medium text-ink transition hover:bg-lime/90"
                >
                  查一家公司 <span className="ml-2">→</span>
                </button>
              </div>
            </div>
          ) : (
            <div
              key={scene}
              className="intro-scene absolute inset-0 flex flex-col justify-center"
            >
              <div className="font-serif text-[clamp(2.2rem,5.2vw,4.5rem)] font-semibold leading-[1.08] tracking-[-0.02em]">
                {SCENES[scene]?.()}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="relative z-10 px-5 pb-6 sm:px-8">
        <div className="mx-auto flex max-w-5xl items-center gap-4">
          <div className="flex gap-1.5">
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className={`h-px w-6 transition-colors duration-500 ${
                  scene >= index ? "bg-lime" : "bg-paper/20"
                }`}
              />
            ))}
          </div>
          <div className="h-px flex-1 bg-paper/10">
            <div className="intro-progress h-px bg-lime" />
          </div>
          <span className="font-mono text-[9px] tracking-[0.18em] text-paper/30">
            SKIP / ENTER
          </span>
        </div>
      </div>
    </div>
  );
}
