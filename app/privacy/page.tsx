import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "隐私说明",
  description:
    "职顾问收集哪些信息、如何脱敏保护、你可以行使哪些权利。不需要注册登录，不使用跟踪脚本。",
  alternates: { canonical: "/privacy" },
};

const SECTIONS = [
  {
    title: "我们收集什么",
    items: [
      "企业申诉 / 更正申请：你填写的联系方式、问题描述与证据链接，仅用于核实与回复申诉。",
      "面试反馈：只收集页面上的结构化选项（几轮面试、多久出结果等），不含任何自由文本。",
      "报告决策反馈：只记录「投了 / 放弃」与固定的放弃原因，不关联身份。",
    ],
  },
  {
    title: "我们不做什么",
    items: [
      "不需要注册登录，不收集手机号、姓名等身份信息（申诉联系方式由你主动提供）。",
      "不使用第三方统计、广告或跟踪脚本，页面不向外部域名发送数据。",
      "不记录可用于还原个人浏览轨迹的信息。",
    ],
  },
  {
    title: "数据如何保护",
    items: [
      "面试反馈的浏览器随机标识在服务端加盐哈希后才入库，原文不保存、无法反推。",
      "申诉联系方式仅处理申诉的运营者可见，不用于任何营销目的。",
      "公开写接口全部限流，防止批量抓取与滥用。",
      "上线后全程 HTTPS 传输加密。",
    ],
  },
  {
    title: "你的权利",
    items: [
      "凭受理编号和提交时的联系方式，随时查询申诉处理进度。",
      "可以要求更正或删除你的申诉记录：通过申诉页再次提交，或按申诉页公示的渠道联系运营者。",
      "申诉处理完成后，仅公示与内容更正相关的说明，不展示你的联系方式。",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl pb-24 pt-12">
      <Link
        href="/"
        className="text-xs text-muted underline underline-offset-4 transition hover:text-ink"
      >
        ← 返回首页
      </Link>

      <header className="mt-7 border-b-2 border-ink pb-6">
        <p className="font-mono text-[10px] tracking-[0.2em] text-accent">
          隐私说明 / PRIVACY
        </p>
        <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
          我们尽可能少知道你
        </h1>
        <p className="mt-3 text-sm leading-7 text-muted">
          职顾问的核心功能不需要知道你是谁。这份说明列出仅有的几处数据收集、
          它们的用途与保护方式，以及你随时可以行使的权利。
        </p>
      </header>

      {SECTIONS.map((section) => (
        <section key={section.title} className="mt-10">
          <h2 className="border-b border-line pb-2 font-serif text-xl font-semibold">
            {section.title}
          </h2>
          <ul className="mt-4 space-y-3 text-sm leading-7">
            {section.items.map((item) => (
              <li key={item} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="mt-2.5 h-1.5 w-1.5 shrink-0 bg-accent"
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="mt-12 border border-line bg-white/70 px-5 py-4">
        <p className="text-sm leading-7 text-muted">
          本站数据全部来自公开渠道，每条记录都能点回原始来源。发现记录有误？{" "}
          <Link
            href="/appeal"
            className="text-accent underline underline-offset-4"
          >
            提交企业申诉或更正
          </Link>
          。
        </p>
      </section>
    </div>
  );
}
