"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  DAYS_OPTIONS,
  PRIVACY_OPTIONS,
  REJECTION_OPTIONS,
  ROUNDS_OPTIONS,
  TEST_TASK_OPTIONS,
} from "@/lib/feedback";

type AnswerKey =
  | "roundsBand"
  | "daysToResultBand"
  | "askedPrivacy"
  | "testTaskBand"
  | "rejectionBand";

type Answers = Record<AnswerKey, string>;

const EMPTY_ANSWERS: Answers = {
  roundsBand: "",
  daysToResultBand: "",
  askedPrivacy: "",
  testTaskBand: "",
  rejectionBand: "",
};

type Status = "idle" | "submitting" | "done" | "duplicate" | "error";

type Option = { value: string; label: string };

function OptionGroup({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  options: ReadonlyArray<Option>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <label
              key={option.value}
              className={`flex min-h-11 cursor-pointer items-center justify-center border px-3 text-center text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink/30 ${
                selected
                  ? "border-ink bg-ink text-paper"
                  : "border-line bg-white text-ink hover:border-ink/40"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function getAnonymousId(): string {
  const key = "zgw_anon_id";
  const fallback = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  try {
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;

    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : fallback;
    window.localStorage.setItem(key, id);
    return id;
  } catch {
    // 隐私模式或存储被禁用时，仍允许提交；只是无法在本浏览器去重。
    return fallback;
  }
}

export function InterviewFeedbackForm({
  companyId,
  companyName,
}: {
  companyId: string;
  companyName: string;
}) {
  const [answers, setAnswers] = useState<Answers>(EMPTY_ANSWERS);
  const [status, setStatus] = useState<Status>("idle");
  const router = useRouter();

  const answeredCount = Object.values(answers).filter(Boolean).length;
  const complete = answeredCount === 5;

  function update(field: AnswerKey, value: string) {
    setAnswers((current) => ({ ...current, [field]: value }));
  }

  async function submit() {
    if (!complete || status === "submitting") return;
    setStatus("submitting");

    try {
      const response = await fetch("/api/interview-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          ...answers,
          anonymousKey: getAnonymousId(),
        }),
      });

      if (response.ok) {
        setStatus("done");
        router.refresh();
      } else if (response.status === 409) {
        setStatus("duplicate");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  if (status === "done" || status === "duplicate") {
    return (
      <div className="border-y border-line py-6">
        <p className="font-serif text-xl font-semibold">
          {status === "done" ? "已提交，谢谢。" : "你已经提交过这家公司的反馈。"}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {status === "done"
            ? "同一家公司、同一个浏览器只能提交一次。样本达到 5 份后，报告页会展示聚合结果。"
            : "同一家公司、同一个浏览器只能提交一次。你的上一次提交已经计入样本。"}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href={`/company/${companyId}`}
            className="inline-flex h-10 items-center bg-ink px-4 text-sm text-paper transition hover:bg-accent"
          >
            返回报告
          </Link>
          <Link
            href="/"
            className="inline-flex h-10 items-center border border-line bg-white px-4 text-sm transition hover:border-ink/40"
          >
            查另一家公司
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="border-y border-line py-5">
        <p className="font-serif text-lg font-semibold">{companyName}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          全部是选择题，不需要写评价。匿名提交，只用于聚合统计。
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          我们只在你浏览器里生成一个随机标识，用于防止重复提交；不读取通讯录、不存 IP/UA。
        </p>
      </div>

      <div className="mt-5 space-y-7">
        <OptionGroup
          legend="1. 面试了几轮？"
          name="roundsBand"
          options={ROUNDS_OPTIONS}
          value={answers.roundsBand}
          onChange={(value) => update("roundsBand", value)}
        />
        <OptionGroup
          legend="2. 从投递到出结果多久？"
          name="daysToResultBand"
          options={DAYS_OPTIONS}
          value={answers.daysToResultBand}
          onChange={(value) => update("daysToResultBand", value)}
        />
        <OptionGroup
          legend="3. 是否被问到婚育、家庭、酒量等私人问题？"
          name="askedPrivacy"
          options={PRIVACY_OPTIONS}
          value={answers.askedPrivacy}
          onChange={(value) => update("askedPrivacy", value)}
        />
        <OptionGroup
          legend="4. 是否有笔试或测试作业？"
          name="testTaskBand"
          options={TEST_TASK_OPTIONS}
          value={answers.testTaskBand}
          onChange={(value) => update("testTaskBand", value)}
        />
        <OptionGroup
          legend="5. 是否收到拒信？"
          name="rejectionBand"
          options={REJECTION_OPTIONS}
          value={answers.rejectionBand}
          onChange={(value) => update("rejectionBand", value)}
        />
      </div>

      <div className="mt-7 border-t border-line pt-5">
        <div className="mb-4 h-0.5 w-full overflow-hidden bg-line">
          <div
            className="h-full bg-accent transition-all"
            style={{ width: `${(answeredCount / 5) * 100}%` }}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-muted">已填 {answeredCount} / 5</p>
          <button
            type="button"
            onClick={submit}
            disabled={!complete || status === "submitting"}
            className="h-11 bg-ink px-5 text-sm text-paper transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            {status === "submitting" ? "提交中…" : "提交匿名反馈"}
          </button>
        </div>
        {status === "error" ? (
          <p className="mt-2 text-xs text-muted" role="alert">
            提交失败，请稍后再试。
          </p>
        ) : null}
      </div>
    </div>
  );
}
