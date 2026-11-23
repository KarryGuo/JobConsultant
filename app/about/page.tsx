import Link from "next/link";
import { COVERED_REGIONS } from "@/lib/coverage";

export const metadata = {
  title: "我们查不到什么",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-3xl pb-16 pt-12">
      <Link href="/" className="text-xs text-muted underline underline-offset-4 transition hover:text-ink">
        ← 返回首页
      </Link>

      <p className="mt-7 font-mono text-[10px] tracking-[0.2em] text-accent">
        调查方法 / METHODOLOGY
      </p>
      <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
        我们查不到什么
      </h1>
      <p className="mt-5 border-l-2 border-accent pl-4 font-serif text-lg leading-8">
        一个敢说自己不知道什么的产品，它说知道的东西才可信。
      </p>

      <section className="mt-12 border-t border-line pt-8">
        <h2 className="font-serif text-xl font-semibold">公开数据覆盖不到的部分</h2>
        <ul className="mt-4 space-y-3 text-sm leading-relaxed text-muted">
          <li>真实的加班强度——没有公开数据。</li>
          <li>真实薪资与招聘描述是否一致——没有公开数据。</li>
          <li>内部管理风格、直属领导为人——无法客观量化。</li>
          <li>公司是否正在准备裁员或解约——除非已有公开信息。</li>
          <li>
            劳动争议判决——2021 年后文书公开率大幅下降。“未检索到”不等于“没有”。
          </li>
          <li>
            被执行、经营异常、失信、破产重整、欠税、行政处罚——当前版本未覆盖。
            查不到不代表公司没有问题，判断经营风险请到官方渠道另行核验。
          </li>
        </ul>
      </section>

      <section className="mt-12 border-t border-line pt-8">
        <h2 className="font-serif text-xl font-semibold">我们怎么确认</h2>
        <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted">
          <p>
            <span className="text-ink">判定用规则。</span>
            规则是纯函数，输入信号、输出命中，没有模型、没有随机。你可以要求我们展示命中了哪条规则。
          </p>
          <p>
            <span className="text-ink">表达用模型，但模型不产生数字。</span>
            所有数字来自结构化字段；模型只负责把已经存在的事实写成人话。模型超时或输出不合格时，直接回落到模板。
          </p>
          <p>
            <span className="text-ink">证据必须可点开。</span>
            每条信号都带来源链接、抓取时间和快照哈希。没有来源的信号不入库；没有信号 ID 的结论不返回。
          </p>
          <p>
            <span className="text-ink">不给公司打分。</span>
            分数是判决，事实是记录。我们只做记录，也会把另一种可能一起写出来。
          </p>
        </div>
      </section>

      <section className="mt-12 border-t border-line pt-8">
        <h2 className="font-serif text-xl font-semibold">
          官方系统 vs 职顾问
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          官方系统是权威来源，我们不替代它们。区别在于：官方给你原始记录，
          我们帮你把记录翻译成求职决策。
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink text-left">
                <th className="py-2 pr-4 font-medium">维度</th>
                <th className="py-2 pr-4 font-medium">官方系统</th>
                <th className="py-2 font-medium">职顾问</th>
              </tr>
            </thead>
            <tbody className="text-muted">
              {[
                ["回答的问题", "有没有这条记录", "这条记录对求职意味着什么"],
                ["数据形态", "原始文书、单点条目", "跨源时间线 + 面试问题"],
                ["解读", "自己判断严重性", "规则判定 + 良性解释"],
                ["更新", "自己反复查", "复核周期、过期警示、来源健康"],
                ["更正", "走官方渠道", "站内申诉 → 处理流水 → 报告重新生成"],
                ["覆盖", "全国单点查询", "本期重点覆盖 + 官方直查兜底"],
              ].map(([dimension, official, ours]) => (
                <tr key={dimension} className="border-b border-line">
                  <td className="py-3 pr-4 align-top text-ink">{dimension}</td>
                  <td className="py-3 pr-4 align-top">{official}</td>
                  <td className="py-3 align-top text-ink">{ours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section
        id="coverage"
        className="mt-12 border-t border-line pt-8"
      >
        <h2 className="font-serif text-xl font-semibold">当前数据来源</h2>
        <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted">
          <p>
            本期覆盖：{COVERED_REGIONS.join("、")}
            人社部门「劳动保障违法行为社会公布」公告，以及一批一线企业主体。
            当前收录的企业主体与公开信号数量以首页实时统计为准。
            <span className="text-ink">这不是全国企业库。</span>
          </p>
          <p>
            当前版本用于结论的 A 级来源是各地人社部门「重大劳动保障违法行为社会公布」公告；国家企业信用信息公示系统、信用中国、中国执行信息公开网作为官方直查入口，不参与自动结论。
          </p>
          <p>
            商业接口与公开新闻只作为线索，不进入结论。用户提交的面试反馈只做结构化聚合，样本少于 5 条不展示。
          </p>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          没有查到想了解的公司？可以{" "}
          <Link
            href="/coverage"
            className="text-accent underline underline-offset-4"
          >
            提交收录请求
          </Link>
          ，或直接到下方官方系统核验。
        </p>
        <div className="mt-4 space-y-2 text-sm">
          <a
            href="https://www.gsxt.gov.cn/index.html"
            target="_blank"
            rel="noreferrer noopener"
            className="block text-accent underline underline-offset-4"
          >
            国家企业信用信息公示系统 ↗
          </a>
          <a
            href="https://www.creditchina.gov.cn/"
            target="_blank"
            rel="noreferrer noopener"
            className="block text-accent underline underline-offset-4"
          >
            信用中国 ↗
          </a>
          <a
            href="http://zxgk.court.gov.cn/"
            target="_blank"
            rel="noreferrer noopener"
            className="block text-accent underline underline-offset-4"
          >
            中国执行信息公开网 ↗
          </a>
        </div>
      </section>

      <section className="mt-12 border-t border-line pt-8">
        <h2 className="font-serif text-xl font-semibold">企业申诉与更正</h2>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          企业可以提交反证、要求更正，但不能要求删除事实。所有更正会保留公开记录。
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          如果发现金额、人数、日期、主体或案件状态有误，或者记录已经履行、整改、撤销，可以提交可核验材料。
        </p>
        <Link
          href="/appeal"
          className="mt-4 inline-flex text-sm text-accent underline underline-offset-4"
        >
          提交企业申诉或更正 →
        </Link>
      </section>

      <section className="mt-12 border-t border-line pt-8">
        <h2 className="font-serif text-xl font-semibold">我们不做什么</h2>
        <ul className="mt-4 space-y-3 text-sm leading-relaxed text-muted">
          <li>不向企业收费，也不做删帖生意。</li>
          <li>不做自由文本评价，避免把情绪当成事实。</li>
          <li>不在查不到时返回一个猜出来的结论，也不返回空白页。</li>
        </ul>
      </section>
    </article>
  );
}
