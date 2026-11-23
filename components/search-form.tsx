"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

type Suggestion = {
  id: string;
  name: string;
  province: string | null;
  city: string | null;
  industry: string | null;
  reason: string;
};

const REASON_LABELS: Record<string, string> = {
  exact: "名称匹配",
  prefix: "名称前缀",
  contains: "名称包含",
  pinyin: "拼音匹配",
  similar: "相似名称",
};

export function SearchForm({
  defaultValue = "",
  size = "md",
  id = "q",
  emphasis = false,
}: {
  defaultValue?: string;
  size?: "md" | "lg";
  id?: string;
  emphasis?: boolean;
}) {
  const large = size === "lg";
  const router = useRouter();
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState(defaultValue);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [itemsQuery, setItemsQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    const trimmed = query.trim();
    const isAscii = /^[a-z0-9]+$/i.test(trimmed);

    if (!trimmed || (isAscii && trimmed.length < 2)) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/search/suggest?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("suggest failed");

        const data = (await response.json()) as { items?: Suggestion[] };
        setItems(Array.isArray(data.items) ? data.items : []);
        setItemsQuery(trimmed);
        setActiveIndex(-1);
        setOpen(true);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setItems([]);
          setItemsQuery(trimmed);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const trimmedQuery = query.trim();
  const asciiTooShort =
    /^[a-z0-9]+$/i.test(trimmedQuery) && trimmedQuery.length < 2;
  const searchable = trimmedQuery.length > 0 && !asciiTooShort;
  const visibleItems = itemsQuery === trimmedQuery ? items : [];
  const pending = searchable && (loading || itemsQuery !== trimmedQuery);

  function selectCompany(item: Suggestion) {
    setOpen(false);
    setQuery(item.name);
    router.push(`/company/${item.id}`);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (activeIndex >= 0 && visibleItems[activeIndex]) {
      selectCompany(visibleItems[activeIndex]);
      return;
    }

    const trimmed = query.trim();
    if (!trimmed) {
      inputRef.current?.focus();
      return;
    }

    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (event.key === "ArrowDown" && visibleItems.length > 0) {
        event.preventDefault();
        setOpen(true);
        setActiveIndex(0);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, visibleItems.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, -1));
    } else if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      selectCompany(visibleItems[activeIndex]);
    }
  }

  return (
    <form action="/search" method="get" onSubmit={submit} className="w-full">
      <div
        className={
          emphasis
            ? "flex flex-col border border-ink bg-white sm:flex-row"
            : "flex flex-col gap-2 sm:flex-row"
        }
      >
        <div
          ref={containerRef}
          className={
            emphasis
              ? "relative flex-1 border-b border-ink sm:border-b-0 sm:border-r"
              : "relative flex-1"
          }
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted ${
              large || emphasis ? "h-[18px] w-[18px]" : "h-4 w-4"
            }`}
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <label htmlFor={id} className="sr-only">
            公司名称
          </label>
          <input
            ref={inputRef}
            id={id}
            name="q"
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (event.target.value.trim()) setOpen(true);
            }}
            onFocus={() => {
              if (query.trim()) setOpen(true);
            }}
            onKeyDown={handleKeyDown}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined
            }
            placeholder="输入公司全称或简称，例如「腾讯」「字节跳动」"
            autoComplete="off"
            enterKeyHint="search"
            className={
              emphasis
                ? "h-14 w-full rounded-none border-0 bg-transparent pl-11 pr-4 text-base text-ink outline-none transition placeholder:text-muted/70 focus:bg-accent-soft/40 focus-visible:outline-none"
                : `w-full rounded-none border border-line bg-white pl-11 pr-4 text-ink outline-none transition placeholder:text-muted/70 focus:border-accent/60 ${
                    large ? "h-14 text-base" : "h-12 text-[15px]"
                  }`
            }
          />

          {open && searchable ? (
            <div className="absolute left-0 right-0 top-full z-30 mt-px border border-ink bg-white shadow-xl">
              {visibleItems.length > 0 ? (
                <ul role="listbox" id={listId} className="max-h-80 overflow-y-auto">
                  {visibleItems.map((item, index) => (
                    <li
                      key={item.id}
                      id={`${listId}-${index}`}
                      role="option"
                      aria-selected={index === activeIndex}
                    >
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectCompany(item)}
                        onMouseEnter={() => setActiveIndex(index)}
                        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
                          index === activeIndex ? "bg-accent-soft" : "hover:bg-paper"
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-serif text-sm font-medium">
                            {item.name}
                          </span>
                          <span className="mt-0.5 block truncate font-mono text-[10px] text-muted">
                            {[item.province, item.city, item.industry]
                              .filter(Boolean)
                              .join(" · ") || "地区与行业待补充"}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-[9px] text-muted">
                          {REASON_LABELS[item.reason] ?? "匹配"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-4 py-3">
                  <p className="text-sm">
                    {pending
                      ? "检索中…"
                      : `暂未收录与「${trimmedQuery}」匹配的公司。`}
                  </p>
                  {!pending ? (
                    <>
                      <p className="mt-1 text-xs leading-5 text-muted">
                        未收录不代表公司有问题，也不代表没有风险。
                      </p>
                      <Link
                        href="/companies"
                        className="mt-2 inline-flex text-xs text-accent underline underline-offset-4"
                      >
                        查看已收录企业 →
                      </Link>
                    </>
                  ) : null}
                </div>
              )}
              <p className="border-t border-line px-4 py-2 font-mono text-[9px] text-muted">
                ↑↓ 选择 · Enter 打开 · Esc 关闭
              </p>
            </div>
          ) : null}
        </div>

        <button
          type="submit"
          className={
            emphasis
              ? "h-14 shrink-0 bg-ink px-7 text-base font-medium text-paper transition hover:bg-accent"
              : `shrink-0 rounded-none bg-ink font-medium text-paper transition hover:bg-accent ${
                  large ? "h-14 px-7 text-base" : "h-12 px-6 text-[15px]"
                }`
          }
        >
          查这家公司
        </button>
      </div>
      <p className="mt-2.5 text-xs text-muted">
        公司全称、简称、拼音都行。查得到的是公开记录，查不到不代表安全。
      </p>
    </form>
  );
}
