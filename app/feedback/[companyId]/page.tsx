import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { InterviewFeedbackForm } from "@/components/interview-feedback-form";
import { prisma } from "@/lib/db";
import { FEEDBACK_MIN_SAMPLE } from "@/lib/feedback";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ companyId: string }>;
}): Promise<Metadata> {
  const { companyId } = await params;
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true },
  });

  return {
    title: company ? `${company.name} · 匿名面试反馈` : "匿名面试反馈",
    robots: { index: false, follow: false },
  };
}

export default async function FeedbackPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, city: true, industry: true },
  });

  if (!company) notFound();

  const sampleCount = await prisma.interviewFeedback.count({
    where: { companyId },
  });

  return (
    <article className="mx-auto max-w-2xl pb-16 pt-12">
      <Link
        href={`/company/${company.id}`}
        className="text-xs text-muted underline underline-offset-4 transition hover:text-ink"
      >
        ← 返回 {company.name}
      </Link>

      <header className="mt-7 border-b border-line pb-6">
        <p className="font-mono text-[10px] tracking-[0.2em] text-accent">
          面试之后 / FEEDBACK
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight">
          面试反馈
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          你不需要写评价，只需要点选事实。样本达到 {FEEDBACK_MIN_SAMPLE} 份后，才会在公司报告页展示聚合结果。
        </p>
        <p className="mt-2 font-mono text-[10px] text-muted">
          当前已有 {sampleCount} 份反馈
          {sampleCount < FEEDBACK_MIN_SAMPLE
            ? `，还差 ${FEEDBACK_MIN_SAMPLE - sampleCount} 份达到展示阈值`
            : "，已可在报告页查看聚合结果"}
          。
        </p>
      </header>

      <div className="mt-7">
        <InterviewFeedbackForm
          companyId={company.id}
          companyName={company.name}
        />
      </div>
    </article>
  );
}
