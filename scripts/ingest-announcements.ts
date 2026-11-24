import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import WordExtractor from "word-extractor";
import * as XLSX from "xlsx";

/**
 * 官方公开公告采集脚本。
 *
 * 只抓取省级人社厅主动公开的公告页，保存原始 HTML 快照，并生成现有
 * `scripts/import-company.ts` 可以直接消费的 JSON。
 *
 * 不登录、不绕过验证码、不调用需要 appKey 的接口。
 */

export type ParsedCase = {
  name: string;
  creditCode?: string;
  legalRep?: string;
  violation: string;
  workerCount?: number;
  amountYuan?: number;
  authority?: string;
  decisionNo?: string;
  listedAt?: string;
  expiresAt?: string;
  stage?: string;
  stageLabel?: string;
  stageDate?: string;
  city?: string;
  warnings: string[];
};

export type ParseResult = {
  cases: ParsedCase[];
  warnings: string[];
};

export type SourceConfig = {
  key: string;
  name: string;
  region: string;
  url: string;
  publishedAt?: string;
  snapshotFile: string;
  outputFile: string;
  parser: (html: string) => ParseResult;
  /**
   * 公告正文只提供附件时的下载地址。设置后抓取二进制文件，
   * 保存为快照并抽取 docx 文本再交给解析器。
   */
  documentUrl?: string;
  documentFile?: string;
  /**
   * 附件类型，默认 docx。`xlsx` 同时覆盖 xlsx 与老版 xls：
   * 运行时按文件头（ZIP / OLE2）自动选择读取方式。
   */
  documentType?: "docx" | "xlsx" | "xls";
  /** 表格类附件的阶段文案。 */
  stage?: string;
  stageLabel?: string;
};

/**
 * 解析器版本。每次修改解析规则都递增，
 * 这样数据库里可以追溯一条信号是由哪个版本产生的。
 */
export const PARSER_VERSION = "2026-11-24.3";

type IngestRunMeta = {
  id: string;
  sourceKey: string;
  sourceUrl: string;
  parserVersion: string;
  status: "success" | "partial" | "failed";
  startedAt: string;
  finishedAt: string;
  httpStatus: number | null;
  contentHash: string;
  snapshotPath: string;
  warnings: number;
  errors: number;
  actor: string;
};

export const SOURCES: SourceConfig[] = [
  {
    key: "henan-hrss-labor-violation",
    name: "河南省人力资源和社会保障厅关于发布2026年第三批拖欠农民工工资失信联合惩戒对象名单的公告",
    region: "河南省",
    url: "https://hrss.henan.gov.cn/2026/10-27/3441361.html",
    publishedAt: "2026-10-27",
    snapshotFile: "data/snapshots/henan-2026-third-labor-violations.html",
    outputFile: "data/companies/henan-2026-third.json",
    parser: parseTableCases,
  },
  {
    key: "anhui-hrss-labor-violation",
    name: "省人社厅公布2026年第三批重大劳动保障违法典型案件和拖欠农民工工资失信联合惩戒对象名单",
    region: "安徽省",
    url: "https://hrss.ah.gov.cn/zxzx/gsgg/80813691.html",
    snapshotFile: "data/snapshots/anhui-2026-third-labor-violations.html",
    outputFile: "data/companies/anhui-2026-third.json",
    parser: parseTableCases,
  },
  {
    key: "hubei-hrss-labor-violation",
    name: "省人社厅公布2026年二季度重大劳动保障违法行为案件",
    region: "湖北省",
    url: "https://rst.hubei.gov.cn/bmdt/dtyw/stfb/202607/t20260713_5975547.shtml",
    publishedAt: "2026-07-13",
    snapshotFile: "data/snapshots/hubei-2026-q2-labor-violations.html",
    outputFile: "data/companies/hubei-2026-q2.json",
    parser: parseParagraphCases,
  },
  {
    key: "fujian-hrss-labor-violation",
    name: "福建省人社厅公布2026年第四批重大劳动保障违法行为",
    region: "福建省",
    url: "https://rst.fj.gov.cn/zw/ldjy/202610/t20261029_7242088.htm",
    publishedAt: "2026-10-29",
    snapshotFile: "data/snapshots/fujian-2026-fourth-labor-violations.html",
    outputFile: "data/companies/fujian-2026-fourth.json",
    parser: parseParagraphCases,
  },
  {
    key: "shaanxi-2025-first-batch",
    name: "陕西省人社厅关于公布2025年第一批拖欠农民工工资失信联合惩戒对象名单和重大劳动保障违法行为的公告",
    region: "陕西省",
    url: "https://rst.shaanxi.gov.cn/sy/tzgg/202504/t20250423_3502322.html",
    publishedAt: "2025-04-23",
    snapshotFile: "data/snapshots/shaanxi-2025-first-labor-violations.html",
    outputFile: "data/companies/shaanxi-2025-first.json",
    parser: parseParagraphCases,
  },
  {
    key: "shaanxi-2026-first-batch",
    name: "陕西省人社厅关于公布2026年第一批拖欠农民工工资失信联合惩戒对象名单和重大劳动保障违法行为的公告",
    region: "陕西省",
    url: "https://rst.shaanxi.gov.cn/sy/tzgg/202604/t20260409_3628479.html",
    publishedAt: "2026-04-09",
    snapshotFile: "data/snapshots/shaanxi-2026-first-labor-violations.html",
    outputFile: "data/companies/shaanxi-2026-first.json",
    parser: parseParagraphCases,
  },
  {
    key: "shaanxi-2026-second-batch",
    name: "陕西省人社厅关于公布2026年第二批拖欠农民工工资失信联合惩戒对象名单和重大劳动保障违法行为的公告",
    region: "陕西省",
    url: "https://rst.shaanxi.gov.cn/sy/ztzl/rdzt/bznmggzzfzl/pgt/202607/t20260731_3662300.html",
    publishedAt: "2026-07-31",
    snapshotFile: "data/snapshots/shaanxi-2026-second-labor-violations.html",
    outputFile: "data/companies/shaanxi-2026-second.json",
    parser: parseParagraphCases,
  },
  {
    key: "henan-2025-first-batch",
    name: "河南省人社厅关于发布2025年第一批拖欠农民工工资失信联合惩戒对象名单的公告",
    region: "河南省",
    url: "https://hrss.henan.gov.cn/2025/05-07/3155561.html",
    publishedAt: "2025-05-07",
    snapshotFile: "data/snapshots/henan-2025-first-labor-violations.html",
    outputFile: "data/companies/henan-2025-first.json",
    parser: parseTableCases,
  },
  {
    key: "henan-2025-second-batch",
    name: "河南省人社厅关于发布2025年第二批拖欠农民工工资失信联合惩戒对象名单的公告",
    region: "河南省",
    url: "https://hrss.henan.gov.cn/2025/07-31/3186006.html",
    publishedAt: "2025-07-31",
    snapshotFile: "data/snapshots/henan-2025-second-labor-violations.html",
    outputFile: "data/companies/henan-2025-second.json",
    parser: parseTableCases,
  },
  {
    key: "henan-2025-third-batch",
    name: "河南省人社厅关于发布2025年第三批拖欠农民工工资失信联合惩戒对象名单的公告",
    region: "河南省",
    url: "https://hrss.henan.gov.cn/2025/10-30/3240299.html",
    publishedAt: "2025-10-30",
    snapshotFile: "data/snapshots/henan-2025-third-labor-violations.html",
    outputFile: "data/companies/henan-2025-third.json",
    parser: parseTableCases,
  },
  {
    key: "henan-2025-fourth-batch",
    name: "河南省人社厅关于发布2025年第四批重大劳动保障违法行为的公告",
    region: "河南省",
    url: "https://hrss.henan.gov.cn/2026/01-19/3311061.html",
    publishedAt: "2026-01-19",
    snapshotFile: "data/snapshots/henan-2025-fourth-labor-violations.html",
    outputFile: "data/companies/henan-2025-fourth.json",
    parser: parseParagraphCases,
  },
  {
    key: "henan-2026-third-cases",
    name: "河南省人社厅关于发布2026年第三批重大劳动保障违法行为的公告",
    region: "河南省",
    url: "https://hrss.henan.gov.cn/2026/10-27/3441363.html",
    publishedAt: "2026-10-27",
    snapshotFile: "data/snapshots/henan-2026-third-labor-violation-cases.html",
    outputFile: "data/companies/henan-2026-third-cases.json",
    parser: parseParagraphCases,
  },
  {
    key: "beijing-2026-first-batch",
    name: "北京市2026年第一批重大劳动保障违法行为社会公布案例",
    region: "北京市",
    url: "https://rsj.beijing.gov.cn/xxgk/tzgg/202603/t20260331_4570554.html",
    publishedAt: "2026-03-31",
    snapshotFile: "data/snapshots/beijing-2026-first-labor-violations.html",
    outputFile: "data/companies/beijing-2026-first.json",
    parser: parseParagraphCases,
  },
  {
    key: "beijing-2026-second-batch",
    name: "北京市2026年第二批重大劳动保障违法行为社会公布案例",
    region: "北京市",
    url: "https://rsj.beijing.gov.cn/xxgk/tzgg/202606/t20260629_4737261.html",
    publishedAt: "2026-06-29",
    snapshotFile: "data/snapshots/beijing-2026-second-labor-violations.html",
    outputFile: "data/companies/beijing-2026-second.json",
    parser: parseParagraphCases,
  },
  {
    key: "beijing-2026-third-batch",
    name: "北京市2026年第三批重大劳动保障违法行为社会公布案例",
    region: "北京市",
    url: "https://rsj.beijing.gov.cn/xxgk/tzgg/202609/t20260930_4886764.html",
    publishedAt: "2026-09-30",
    snapshotFile: "data/snapshots/beijing-2026-third-labor-violations.html",
    outputFile: "data/companies/beijing-2026-third.json",
    parser: parseParagraphCases,
  },
  {
    key: "shanxi-2026-first-batch",
    name: "山西省人社厅发布2026年度第一批重大劳动保障违法行为典型案件",
    region: "山西省",
    url: "https://rst.shanxi.gov.cn/gzqxjxs/pgt/202604/t20260407_10094004.html",
    publishedAt: "2026-04-07",
    snapshotFile: "data/snapshots/shanxi-2026-first-labor-violations.html",
    outputFile: "data/companies/shanxi-2026-first.json",
    parser: parseParagraphCases,
  },
  {
    key: "shanxi-2026-second-batch",
    name: "山西省人社厅发布2026年度第二批重大劳动保障违法行为典型案件",
    region: "山西省",
    url: "https://rst.shanxi.gov.cn/gzqxjxs/pgt/202607/t20260707_10172112.html",
    publishedAt: "2026-07-07",
    snapshotFile: "data/snapshots/shanxi-2026-second-labor-violations.html",
    outputFile: "data/companies/shanxi-2026-second.json",
    parser: parseParagraphCases,
  },
  {
    key: "shanxi-2026-third-batch",
    name: "山西省人社厅公布2026年度第三批重大劳动保障违法行为典型案件",
    region: "山西省",
    url: "https://rst.shanxi.gov.cn/gzqxjxs/pgt/202610/t20261008_10231166.html",
    publishedAt: "2026-10-08",
    snapshotFile: "data/snapshots/shanxi-2026-third-labor-violations.html",
    outputFile: "data/companies/shanxi-2026-third.json",
    parser: parseParagraphCases,
  },
  {
    key: "tianjin-baodi-2026-second",
    name: "天津市宝坻区人社局关于公布2026年第二季度重大劳动保障违法行为的公告",
    region: "天津市",
    url: "https://www.tjbd.gov.cn/zwgk/zfxxgkqjjg/rlsbj/fdzdgknr16/xzcfqz16/202606/t20260623_7322327.html",
    publishedAt: "2026-06-23",
    snapshotFile: "data/snapshots/tianjin-baodi-2026-second-labor-violations.html",
    outputFile: "data/companies/tianjin-baodi-2026-second.json",
    parser: parseParagraphCases,
  },
  {
    key: "sichuan-2026-third-cases",
    name: "四川省2026年第三季度重大劳动保障违法行为",
    region: "四川省",
    url: "http://rst.sc.gov.cn/rst/gsgg/2026/10/8/50cd9ec2d23141b49ad9376a10f2697e.shtml",
    publishedAt: "2026-10-08",
    snapshotFile: "data/snapshots/sichuan-2026-third-cases.docx",
    documentFile: "data/snapshots/sichuan-2026-third-cases.docx",
    documentUrl: encodeURI(
      "http://rst.sc.gov.cn/rst/gsgg/2026/10/8/50cd9ec2d23141b49ad9376a10f2697e/files/1.四川省2026年第三季度重大劳动保障违法行为.docx",
    ),
    outputFile: "data/companies/sichuan-2026-third-cases.json",
    parser: parseParagraphCases,
  },
  {
    key: "sichuan-2026-third-list",
    name: "四川省2026年第三季度拖欠农民工工资失信联合惩戒对象名单",
    region: "四川省",
    url: "http://rst.sc.gov.cn/rst/gsgg/2026/10/8/50cd9ec2d23141b49ad9376a10f2697e.shtml",
    publishedAt: "2026-10-08",
    snapshotFile: "data/snapshots/sichuan-2026-third-list.docx",
    documentFile: "data/snapshots/sichuan-2026-third-list.docx",
    documentUrl: encodeURI(
      "http://rst.sc.gov.cn/rst/gsgg/2026/10/8/50cd9ec2d23141b49ad9376a10f2697e/files/2.四川省2026年第三季度拖欠农民工工资失信联合惩戒对象名单.docx",
    ),
    outputFile: "data/companies/sichuan-2026-third-list.json",
    parser: parseTextTableCases,
  },
  {
    key: "jiangsu-2026-third-cases",
    name: "江苏省人社厅公布2026年三季度重大劳动保障违法行为",
    region: "江苏省",
    url: "https://jshrss.jiangsu.gov.cn/art/2026/10/9/art_78504_11839288.html",
    publishedAt: "2026-10-09",
    snapshotFile: "data/snapshots/jiangsu-2026-third-cases.xlsx",
    documentFile: "data/snapshots/jiangsu-2026-third-cases.xlsx",
    documentType: "xlsx",
    stage: "列入重大劳动保障违法行为社会公布",
    stageLabel: "社会公布",
    documentUrl:
      "https://jshrss.jiangsu.gov.cn/module/download/downfile.jsp?classid=0&filename=08e8b15693e84458b0ed5c4ce6cf1a03.xlsx",
    outputFile: "data/companies/jiangsu-2026-third-cases.json",
    parser: parseParagraphCases,
  },
  {
    key: "jiangsu-2026-third-list",
    name: "江苏省2026年第三批拖欠农民工工资失信联合惩戒对象名单",
    region: "江苏省",
    url: "https://jshrss.jiangsu.gov.cn/art/2026/10/9/art_78504_11839288.html",
    publishedAt: "2026-10-09",
    snapshotFile: "data/snapshots/jiangsu-2026-third-list.xlsx",
    documentFile: "data/snapshots/jiangsu-2026-third-list.xlsx",
    documentType: "xlsx",
    stage: "列入拖欠农民工工资失信联合惩戒对象名单",
    stageLabel: "列入失信名单",
    documentUrl:
      "https://jshrss.jiangsu.gov.cn/module/download/downfile.jsp?classid=0&filename=20dba4be51984f4dac42c455121e5e71.xlsx",
    outputFile: "data/companies/jiangsu-2026-third-list.json",
    parser: parseParagraphCases,
  },
  {
    key: "hebei-luquan-2026-10",
    name: "石家庄市鹿泉区人社局关于公布重大劳动保障违法行为的公告",
    region: "河北省",
    url: "https://www.sjzlq.gov.cn/columns/757a5248-a337-4f80-8267-974d8af52611/202610/12/e1de1b1d-68be-49bd-9900-dea9ce77bc46.html",
    publishedAt: "2026-10-12",
    snapshotFile: "data/snapshots/hebei-luquan-2026-10.html",
    outputFile: "data/companies/hebei-luquan-2026-10.json",
    parser: parseTableCases,
  },
  {
    key: "hebei-zhengding-2026-10",
    name: "正定县人社局关于公布重大劳动保障违法行为的公告",
    region: "河北省",
    url: "http://www.zd.gov.cn/columns/4a0cdd91-94c4-420c-b998-ce261ceafe25/202610/15/2f98522b-97db-4139-bc4b-d9c02faa29a7.html",
    publishedAt: "2026-10-15",
    snapshotFile: "data/snapshots/hebei-zhengding-2026-10.html",
    outputFile: "data/companies/hebei-zhengding-2026-10.json",
    parser: parseTableCases,
  },
  {
    key: "neimenggu-alxa-2026-first",
    name: "阿拉善盟关于公布2026年第一批重大劳动保障违法行为对象名单的公告",
    region: "内蒙古自治区",
    url: "https://www.als.gov.cn/art/2026/8/24/art_46_553515.html",
    publishedAt: "2026-08-24",
    snapshotFile: "data/snapshots/neimenggu-alxa-2026-first.html",
    outputFile: "data/companies/neimenggu-alxa-2026-first.json",
    parser: parseParagraphCases,
  },
  {
    key: "neimenggu-hohhot-2026-jan-aug",
    name: "呼和浩特市2026年1至8月拖欠农民工工资失信联合惩戒对象名单公示",
    region: "内蒙古自治区",
    url: "http://rsj.huhhot.gov.cn/slb/ywzt_slb/202609/t20260904_2034302.html",
    publishedAt: "2026-09-04",
    snapshotFile: "data/snapshots/neimenggu-hohhot-2026-jan-aug.html",
    outputFile: "data/companies/neimenggu-hohhot-2026-jan-aug.json",
    parser: parseParagraphCases,
  },
  {
    key: "neimenggu-tongliao-2026-first",
    name: "通辽市2026年重大劳动保障违法行为社会公布（第一批）",
    region: "内蒙古自治区",
    url: "https://rsj.tongliao.gov.cn/xwzx/tzgg/202607/t20260717_1060639.html",
    publishedAt: "2026-03-30",
    snapshotFile: "data/snapshots/neimenggu-tongliao-2026-first.html",
    outputFile: "data/companies/neimenggu-tongliao-2026-first.json",
    parser: parseParagraphCases,
  },
  {
    key: "neimenggu-tongliao-2026-second",
    name: "通辽市2026年重大劳动保障违法行为社会公布（第二批）",
    region: "内蒙古自治区",
    url: "https://rsj.tongliao.gov.cn/xwzx/tzgg/202607/t20260717_1060640.html",
    publishedAt: "2026-06-29",
    snapshotFile: "data/snapshots/neimenggu-tongliao-2026-second.html",
    outputFile: "data/companies/neimenggu-tongliao-2026-second.json",
    parser: parseParagraphCases,
  },
  {
    key: "liaoning-2026-first-half",
    name: "辽宁省人社厅公布2026年上半年重大劳动保障违法案例",
    region: "辽宁省",
    url: "https://rst.ln.gov.cn/rst/zxzx/gsgg/2026080509185490890/index.shtml",
    publishedAt: "2026-08-05",
    snapshotFile: "data/snapshots/liaoning-2026-first-half.html",
    outputFile: "data/companies/liaoning-2026-first-half.json",
    parser: parseParagraphCases,
  },
  {
    key: "liaoning-shenyang-2026-second",
    name: "沈阳市2026年第二批重大劳动保障违法案件公告",
    region: "辽宁省",
    url: "https://rsj.shenyang.gov.cn/zwxx/fdzdgknr/xzzf/zfjg/202607/t20260703_5052309.html",
    publishedAt: "2026-07-03",
    snapshotFile: "data/snapshots/liaoning-shenyang-2026-second.html",
    outputFile: "data/companies/liaoning-shenyang-2026-second.json",
    parser: parseParagraphCases,
  },
  {
    key: "heilongjiang-2025-q4",
    name: "黑龙江省2025年四季度重大劳动保障违法行为社会公布",
    region: "黑龙江省",
    url: "https://hrss.hlj.gov.cn/hrss/c111741/202512/c00_31897328.shtml",
    publishedAt: "2025-12-16",
    snapshotFile: "data/snapshots/heilongjiang-2025-q4.html",
    outputFile: "data/companies/heilongjiang-2025-q4.json",
    parser: parseParagraphCases,
  },
  {
    key: "heilongjiang-heihe-2026",
    name: "黑河市2026年重大劳动保障违法行为社会公布",
    region: "黑龙江省",
    url: "https://www.heihe.gov.cn/hhs/c102625/202610/c11_361932.shtml",
    publishedAt: "2026-10-26",
    snapshotFile: "data/snapshots/heilongjiang-heihe-2026.html",
    outputFile: "data/companies/heilongjiang-heihe-2026.json",
    parser: parseParagraphCases,
  },
  {
    key: "chongqing-2026-q3-first",
    name: "重庆市2026年第三季度重大劳动保障违法行为社会公布（第一批）",
    region: "重庆市",
    url: "https://rlsbj.cq.gov.cn/zwgk_182/fdzdgknr/cfqz_635/xkcfsgs/202610/t20261010_16211311.html",
    publishedAt: "2026-10-10",
    snapshotFile: "data/snapshots/chongqing-2026-q3-first.html",
    outputFile: "data/companies/chongqing-2026-q3-first.json",
    parser: parseParagraphCases,
  },
  {
    key: "chongqing-2026-q3-second",
    name: "重庆市2026年第三季度重大劳动保障违法行为社会公布（第二批）",
    region: "重庆市",
    url: "https://rlsbj.cq.gov.cn/zwgk_182/fdzdgknr/cfqz_635/xkcfsgs/202611/t20261119_16439527.html",
    publishedAt: "2026-11-19",
    snapshotFile: "data/snapshots/chongqing-2026-q3-second.html",
    outputFile: "data/companies/chongqing-2026-q3-second.json",
    parser: parseParagraphCases,
  },
  {
    key: "chongqing-2026-q2",
    name: "重庆市2026年第二季度重大劳动保障违法行为社会公布",
    region: "重庆市",
    url: "https://rlsbj.cq.gov.cn/zwgk_182/fdzdgknr/cfqz_635/xkcfsgs/202607/t20260720_15832707.html",
    publishedAt: "2026-07-20",
    snapshotFile: "data/snapshots/chongqing-2026-q2.html",
    outputFile: "data/companies/chongqing-2026-q2.json",
    parser: parseParagraphCases,
  },
  {
    key: "guizhou-2026-first",
    name: "贵州省2026年第一批重大劳动保障违法案件",
    region: "贵州省",
    url: "https://rst.guizhou.gov.cn/xwzx/gggs/202603/t20260324_89902462.html",
    publishedAt: "2026-03-24",
    snapshotFile: "data/snapshots/guizhou-2026-first.html",
    outputFile: "data/companies/guizhou-2026-first.json",
    parser: parseParagraphCases,
  },
  {
    key: "guizhou-2026-second",
    name: "贵州省2026年第二批重大劳动保障违法案件",
    region: "贵州省",
    url: "https://rst.guizhou.gov.cn/zwgk/zdlyxx/ldjc/202606/t20260629_90565114.html",
    publishedAt: "2026-06-29",
    snapshotFile: "data/snapshots/guizhou-2026-second.html",
    outputFile: "data/companies/guizhou-2026-second.json",
    parser: parseParagraphCases,
  },
  {
    key: "guizhou-2026-second-list",
    name: "贵州省2026年第二批拖欠农民工工资失信联合惩戒对象名单",
    region: "贵州省",
    url: "https://rst.guizhou.gov.cn/zwgk/zdlyxx/ldjc/202606/t20260629_90565139.html",
    publishedAt: "2026-06-29",
    snapshotFile: "data/snapshots/guizhou-2026-second-list.html",
    outputFile: "data/companies/guizhou-2026-second-list.json",
    parser: parseTableCases,
  },
  {
    key: "yunnan-2026-third",
    name: "云南省2026年第三批重大劳动保障违法案例",
    region: "云南省",
    url: "http://zwfw.hrss.yn.gov.cn/NewsView.aspx?cid=558&isZt=7&nid=66226&pid=971",
    snapshotFile: "data/snapshots/yunnan-2026-third.html",
    outputFile: "data/companies/yunnan-2026-third.json",
    parser: parseParagraphCases,
  },
  {
    key: "guangxi-2026-third",
    name: "广西2026年第三批重大劳动保障违法案例",
    region: "广西壮族自治区",
    url: "http://rst.gxzf.gov.cn/zwgk/xxgk/xzxksp/t28272827.shtml",
    publishedAt: "2026-10-26",
    snapshotFile: "data/snapshots/guangxi-2026-third.html",
    outputFile: "data/companies/guangxi-2026-third.json",
    parser: parseParagraphCases,
  },
  {
    key: "guangxi-2026-second",
    name: "广西2026年第二批拖欠农民工工资失信联合惩戒对象名单和重大劳动保障违法案例",
    region: "广西壮族自治区",
    url: "http://rst.gxzf.gov.cn/zwgk/ywfl/zh/xzzfgs/zfjg/t27943636.shtml",
    publishedAt: "2026-07-23",
    snapshotFile: "data/snapshots/guangxi-2026-second.html",
    outputFile: "data/companies/guangxi-2026-second.json",
    parser: parseParagraphCases,
  },
  {
    key: "qinghai-2026-q1",
    name: "青海省2026年第一季度重大劳动保障违法行为典型案件",
    region: "青海省",
    url: "http://rst.qinghai.gov.cn/ztzl/gzqxbgt/query/202605081755058598.html",
    snapshotFile: "data/snapshots/qinghai-2026-q1.html",
    outputFile: "data/companies/qinghai-2026-q1.json",
    parser: parseParagraphCases,
  },
  {
    key: "qinghai-2026-q2",
    name: "青海省2026年第二季度重大劳动保障违法行为典型案例",
    region: "青海省",
    url: "http://rst.qinghai.gov.cn/ztzl/gzqxbgt/query/202607161602583328.html",
    snapshotFile: "data/snapshots/qinghai-2026-q2.html",
    outputFile: "data/companies/qinghai-2026-q2.json",
    parser: parseParagraphCases,
  },
  {
    key: "xizang-2026-07",
    name: "西藏自治区2026年重大劳动保障违法行为社会公布名单（7月）",
    region: "西藏自治区",
    url: "https://hrss.xizang.gov.cn/zwgk/fdzdgknr/xzzfxxgs/202607/t20260716_550280.html",
    publishedAt: "2026-07-16",
    snapshotFile: "data/snapshots/xizang-2026-07.html",
    outputFile: "data/companies/xizang-2026-07.json",
    parser: parseParagraphCases,
  },
  {
    key: "xizang-2026-03",
    name: "西藏自治区2026年重大劳动保障违法行为社会公布名单（3月）",
    region: "西藏自治区",
    url: "https://hrss.xizang.gov.cn/zwgk/fdzdgknr/xzzfxxgs/202603/t20260319_530116.html",
    publishedAt: "2026-03-19",
    snapshotFile: "data/snapshots/xizang-2026-03.html",
    outputFile: "data/companies/xizang-2026-03.json",
    parser: parseParagraphCases,
  },
  {
    key: "xinjiang-2026-first-cases",
    name: "新疆2026年第一批重大劳动保障违法行为公布",
    region: "新疆维吾尔自治区",
    url: "http://rst.xinjiang.gov.cn/xjrst/c112681/202608/2065b8ab1d48475699d585f35b5585b6.shtml",
    publishedAt: "2026-08-24",
    snapshotFile: "data/snapshots/xinjiang-2026-first-cases.doc",
    documentFile: "data/snapshots/xinjiang-2026-first-cases.doc",
    documentUrl: encodeURI(
      "https://rst.xinjiang.gov.cn/xjrst/c112681/202608/2065b8ab1d48475699d585f35b5585b6/files/新疆2026年第一批重大劳动保障违法行为公布.docx",
    ),
    outputFile: "data/companies/xinjiang-2026-first-cases.json",
    parser: (text) =>
      parseLegacyDocCases(
        text,
        "重大劳动保障违法行为社会公布",
        "社会公布",
      ),
  },
  {
    key: "xinjiang-2026-first-list",
    name: "新疆2026年第一批拖欠农民工工资失信联合惩戒对象名单公布",
    region: "新疆维吾尔自治区",
    url: "http://rst.xinjiang.gov.cn/xjrst/c112681/202608/2065b8ab1d48475699d585f35b5585b6.shtml",
    publishedAt: "2026-08-24",
    snapshotFile: "data/snapshots/xinjiang-2026-first-list.xls",
    documentFile: "data/snapshots/xinjiang-2026-first-list.xls",
    documentType: "xls",
    stage: "列入拖欠农民工工资失信联合惩戒对象名单",
    stageLabel: "列入失信名单",
    documentUrl: encodeURI(
      "https://rst.xinjiang.gov.cn/xjrst/c112681/202608/2065b8ab1d48475699d585f35b5585b6/files/新疆2026年第一批拖欠农民工工资失信联合惩戒对象名单公布.xlsx",
    ),
    outputFile: "data/companies/xinjiang-2026-first-list.json",
    parser: parseTextTableCases,
  },
  {
    key: "ningxia-2026-q2-cases",
    name: "宁夏回族自治区2026年第二季度重大劳动保障违法行为信息表",
    region: "宁夏回族自治区",
    url: "https://hrss.nx.gov.cn/gzdt/gsgg/202607/t20260709_5285997.html",
    publishedAt: "2026-07-09",
    snapshotFile: "data/snapshots/ningxia-2026-q2-cases.doc",
    documentFile: "data/snapshots/ningxia-2026-q2-cases.doc",
    documentUrl:
      "https://hrss.nx.gov.cn/gzdt/gsgg/202607/P020260709633176139254.doc",
    outputFile: "data/companies/ningxia-2026-q2-cases.json",
    parser: (text) =>
      parseLegacyDocCases(
        text,
        "重大劳动保障违法行为社会公布",
        "社会公布",
      ),
  },
  {
    key: "hainan-2026-second-list",
    name: "海南省人力资源和社会保障厅关于公布2026年第二批拖欠农民工工资失信联合惩戒对象名单的公告",
    region: "海南省",
    url: "https://hrss.hainan.gov.cn/hrss/1000/202608/1969fc6ef3f740beb3a007eb948008c4.shtml",
    publishedAt: "2026-07-31",
    snapshotFile: "data/snapshots/hainan-2026-second-list.xlsx",
    documentFile: "data/snapshots/hainan-2026-second-list.xlsx",
    documentType: "xlsx",
    stage: "列入拖欠农民工工资失信联合惩戒对象名单",
    stageLabel: "列入失信名单",
    documentUrl:
      "https://hrss.hainan.gov.cn/hrss/1000/202608/1969fc6ef3f740beb3a007eb948008c4/files/a056b0fdb4174483a1bc687133821a2d.xlsx",
    outputFile: "data/companies/hainan-2026-second-list.json",
    parser: parseTextTableCases,
  },
  {
    key: "hunan-2026-q3-cases",
    name: "湖南省人力资源和社会保障厅关于公布2026年第三季度重大劳动保障违法案件的公告",
    region: "湖南省",
    url: "https://rst.hunan.gov.cn/rst/ztzl/gzqx/zdal/202611/t20261123_34109978.html",
    publishedAt: "2026-11-23",
    snapshotFile: "data/snapshots/hunan-2026-q3-cases.doc",
    documentFile: "data/snapshots/hunan-2026-q3-cases.doc",
    documentUrl:
      "https://rst.hunan.gov.cn/rst/ztzl/gzqx/zdal/202611/34109978/files/6240feb42afc4fc68b72243b0a82b8cc.doc",
    outputFile: "data/companies/hunan-2026-q3-cases.json",
    parser: parseWageParagraphCases,
  },
  {
    key: "hunan-2026-q3-list",
    name: "湖南省人力资源和社会保障厅关于公布2026年第三季度拖欠农民工工资失信联合惩戒对象名单信息的公告",
    region: "湖南省",
    url: "https://rst.hunan.gov.cn/rst/ztzl/gzqx/zdal/202611/t20261123_34109977.html",
    publishedAt: "2026-11-23",
    snapshotFile: "data/snapshots/hunan-2026-q3-list.doc",
    documentFile: "data/snapshots/hunan-2026-q3-list.doc",
    documentUrl:
      "https://rst.hunan.gov.cn/rst/ztzl/gzqx/zdal/202611/34109977/files/b904f82816d2435ca4ff875c79c247d1.doc",
    outputFile: "data/companies/hunan-2026-q3-list.json",
    parser: (text) =>
      parseNameListCases(
        text,
        "列入拖欠农民工工资失信联合惩戒对象名单",
        "列入失信名单",
      ),
  },
  {
    key: "hunan-2026-q2-cases",
    name: "湖南省人力资源和社会保障厅关于公布2026年第二季度重大劳动保障违法案件的公告",
    region: "湖南省",
    url: "https://rst.hunan.gov.cn/rst/ztzl/gzqx/zdal/202607/t20260724_34033166.html",
    publishedAt: "2026-07-24",
    snapshotFile: "data/snapshots/hunan-2026-q2-cases.docx",
    documentFile: "data/snapshots/hunan-2026-q2-cases.docx",
    documentUrl:
      "https://rst.hunan.gov.cn/rst/ztzl/gzqx/zdal/202607/34033166/files/5ee015f385c649d5b39fd5e6f1005f77.docx",
    outputFile: "data/companies/hunan-2026-q2-cases.json",
    parser: parseWageParagraphCases,
  },
  {
    key: "hunan-2026-q2-list",
    name: "湖南省人力资源和社会保障厅关于公布2026年第二季度拖欠农民工工资失信联合惩戒对象名单信息的公告",
    region: "湖南省",
    url: "https://rst.hunan.gov.cn/rst/ztzl/gzqx/zdal/202607/t20260724_34033111.html",
    publishedAt: "2026-07-24",
    snapshotFile: "data/snapshots/hunan-2026-q2-list.docx",
    documentFile: "data/snapshots/hunan-2026-q2-list.docx",
    documentUrl:
      "https://rst.hunan.gov.cn/rst/ztzl/gzqx/zdal/202607/34033111/files/9025ef5b0384432382fd4a390501068a.docx",
    outputFile: "data/companies/hunan-2026-q2-list.json",
    parser: (text) =>
      parseNameListCases(
        text,
        "列入拖欠农民工工资失信联合惩戒对象名单",
        "列入失信名单",
      ),
  },
  {
    key: "shandong-2026-q3-cases",
    name: "山东省人力资源和社会保障厅关于公布全省2026年第三批重大劳动保障违法行为的公告",
    region: "山东省",
    url: "http://hrss.shandong.gov.cn/articles/ch07673/202610/fb875684-0609-468f-acc6-453201d51a6e.shtml",
    publishedAt: "2026-10-15",
    snapshotFile: "data/snapshots/shandong-2026-q3-cases.html",
    outputFile: "data/companies/shandong-2026-q3-cases.json",
    parser: parseWageParagraphCases,
  },
  {
    key: "shandong-2026-q2-cases",
    name: "山东省人力资源和社会保障厅关于公布全省2026年第二批重大劳动保障违法行为的公告",
    region: "山东省",
    url: "http://hrss.shandong.gov.cn/articles/ch05525/202607/438d3ae9-8e12-42c8-8870-ed1656f1ffaa.shtml",
    publishedAt: "2026-07-06",
    snapshotFile: "data/snapshots/shandong-2026-q2-cases.html",
    outputFile: "data/companies/shandong-2026-q2-cases.json",
    parser: parseWageParagraphCases,
  },
  {
    key: "shandong-2026-q3-list",
    name: "山东省2026年第三批拖欠农民工工资失信联合惩戒对象名单",
    region: "山东省",
    url: "http://hrss.shandong.gov.cn/articles/ch05525/202610/20f242ba-110f-4da4-af80-96da928bf0c7.shtml",
    publishedAt: "2026-10-15",
    snapshotFile: "data/snapshots/shandong-2026-q3-list.xlsx",
    documentFile: "data/snapshots/shandong-2026-q3-list.xlsx",
    documentType: "xlsx",
    stage: "列入拖欠农民工工资失信联合惩戒对象名单",
    stageLabel: "列入失信名单",
    documentUrl:
      "http://hrss.shandong.gov.cn/resource/srst/att/202610/9b087cb5-24aa-45f8-84f8-e511448ddd8a.xlsx",
    outputFile: "data/companies/shandong-2026-q3-list.json",
    parser: parseTextTableCases,
  },
  {
    key: "jilin-2026-q1-cases",
    name: "吉林省人社厅公布2026年第一批重大劳动保障违法行为典型案件",
    region: "吉林省",
    url: "http://hrss.jl.gov.cn/ldgx/ldjc/ldbzjcgzdt/202607/t20260717_9666375.html",
    publishedAt: "2026-07-17",
    snapshotFile: "data/snapshots/jilin-2026-q1-cases.html",
    outputFile: "data/companies/jilin-2026-q1-cases.json",
    parser: parseWageParagraphCases,
  },
  {
    key: "jilin-2026-q2-list",
    name: "吉林省人社厅公布2026年第二批拖欠农民工工资失信联合惩戒对象名单",
    region: "吉林省",
    url: "http://hrss.jl.gov.cn/ldgx/ldjc/ldjczfnljs/202607/t20260717_9666373.html",
    publishedAt: "2026-07-17",
    snapshotFile: "data/snapshots/jilin-2026-q2-list.xlsx",
    documentFile: "data/snapshots/jilin-2026-q2-list.xlsx",
    documentType: "xlsx",
    stage: "列入拖欠农民工工资失信联合惩戒对象名单",
    stageLabel: "列入失信名单",
    documentUrl:
      "http://hrss.jl.gov.cn/ldgx/ldjc/ldjczfnljs/202607/P020260717521818974010.xlsx",
    outputFile: "data/companies/jilin-2026-q2-list.json",
    parser: parseTextTableCases,
  },
  {
    key: "jilin-2026-q3-list",
    name: "吉林省人社厅公布2026年第三批拖欠农民工工资失信联合惩戒对象名单",
    region: "吉林省",
    url: "http://hrss.jl.gov.cn/ldgx/ldjc/ldjczfnljs/202611/t20261106_9739854.html",
    publishedAt: "2026-11-06",
    snapshotFile: "data/snapshots/jilin-2026-q3-list.xlsx",
    documentFile: "data/snapshots/jilin-2026-q3-list.xlsx",
    documentType: "xlsx",
    stage: "列入拖欠农民工工资失信联合惩戒对象名单",
    stageLabel: "列入失信名单",
    documentUrl:
      "http://hrss.jl.gov.cn/ldgx/ldjc/ldjczfnljs/202611/P020261106316225577429.xlsx",
    outputFile: "data/companies/jilin-2026-q3-list.json",
    parser: parseTextTableCases,
  },
  {
    key: "shanghai-2026-q2-list",
    name: "2026年二季度本市拖欠农民工工资失信联合惩戒对象名单集中通报",
    region: "上海市",
    url: "https://rsj.sh.gov.cn/tgsgg_17341/20260803/ac331283218340779f68a6d01e51ba1d.html",
    publishedAt: "2026-06-30",
    snapshotFile: "data/snapshots/shanghai-2026-q2-list.xlsx",
    documentFile: "data/snapshots/shanghai-2026-q2-list.xlsx",
    documentType: "xlsx",
    stage: "列入拖欠农民工工资失信联合惩戒对象名单",
    stageLabel: "列入失信名单",
    documentUrl:
      "https://rsj.sh.gov.cn/cmsres/33/3386b6204bfa4d3e8db111ca1e77fbf3/f56551b124afc27a4686522672602d47.xlsx",
    outputFile: "data/companies/shanghai-2026-q2-list.json",
    parser: parseTextTableCases,
  },
  {
    key: "shanghai-2026-q3-list",
    name: "2026年三季度本市拖欠农民工工资失信联合惩戒对象名单集中通报",
    region: "上海市",
    url: "https://rsj.sh.gov.cn/tgsgg_17341/20261103/f7acfeeee0864d1a822de25a711ced56.html",
    publishedAt: "2026-09-30",
    snapshotFile: "data/snapshots/shanghai-2026-q3-list.xlsx",
    documentFile: "data/snapshots/shanghai-2026-q3-list.xlsx",
    documentType: "xlsx",
    stage: "列入拖欠农民工工资失信联合惩戒对象名单",
    stageLabel: "列入失信名单",
    documentUrl:
      "https://rsj.sh.gov.cn/cmsres/13/136a7b63304c476ab75d13fbc16ab460/f56551b124afc27a4686522672602d47.xlsx",
    outputFile: "data/companies/shanghai-2026-q3-list.json",
    parser: parseTextTableCases,
  },
  {
    key: "gansu-tianshui-2026-q4-cases",
    name: "天水市关于公布2026年度第四批重大劳动保障违法行为的公告",
    region: "甘肃省",
    url: "https://www.tianshui.gov.cn/rsj/info/1051/140362.htm",
    publishedAt: "2026-11-10",
    snapshotFile: "data/snapshots/gansu-tianshui-2026-q4-cases.html",
    outputFile: "data/companies/gansu-tianshui-2026-q4-cases.json",
    parser: parseWageParagraphCases,
  },
  {
    key: "gansu-tianshui-2026-q3-cases",
    name: "天水市关于公布2026年度第三批重大劳动保障违法行为的公告",
    region: "甘肃省",
    url: "https://www.tianshui.gov.cn/rsj/info/1952/139522.htm",
    publishedAt: "2026-09-04",
    snapshotFile: "data/snapshots/gansu-tianshui-2026-q3-cases.html",
    outputFile: "data/companies/gansu-tianshui-2026-q3-cases.json",
    parser: parseWageParagraphCases,
  },
  {
    key: "gansu-jiuquan-2026-q2-cases",
    name: "酒泉市关于公布2026年第二批重大劳动保障违法行为及拖欠农民工工资失信联合惩戒对象名单的公告",
    region: "甘肃省",
    url: "https://rsj.jiuquan.gov.cn/rsj/c106789/202606/af3605af2e4741418eca62b4eb8b3378.shtml",
    publishedAt: "2026-06-04",
    snapshotFile: "data/snapshots/gansu-jiuquan-2026-q2-cases.html",
    outputFile: "data/companies/gansu-jiuquan-2026-q2-cases.json",
    parser: parseWageParagraphCases,
  },
  {
    key: "gansu-lanzhou-chengguan-2026-q2-cases",
    name: "关于公布兰州市城关区2026年第二批重大劳动保障违法行为的公告",
    region: "甘肃省",
    url: "https://credit.lanzhou.gov.cn/775.news.detail.dhtml?news_id=167392",
    publishedAt: "2026-09-02",
    snapshotFile: "data/snapshots/gansu-lanzhou-chengguan-2026-q2-cases.html",
    outputFile: "data/companies/gansu-lanzhou-chengguan-2026-q2-cases.json",
    parser: parseWageParagraphCases,
  },
  {
    key: "gansu-lanzhou-yuzhong-2026-q3-cases",
    name: "榆中县关于公布2026年第三批重大劳动保障违法行为的公告",
    region: "甘肃省",
    url: "https://credit.lanzhou.gov.cn/324.news.detail.dhtml?news_id=167508",
    publishedAt: "2026-09-01",
    snapshotFile: "data/snapshots/gansu-lanzhou-yuzhong-2026-q3-cases.html",
    outputFile: "data/companies/gansu-lanzhou-yuzhong-2026-q3-cases.json",
    parser: parseWageParagraphCases,
  },
];

const CODE_RE = /[0-9A-Z]{18}/;
const DATE_RE = /(20\d{2})[./年-](\d{1,2})[./月-](\d{1,2})/g;
const AUTHORITY_RE =
  /[\u4e00-\u9fa5]{2,24}(?:人力资源和社会保障局|人社局|劳动保障监察大队|综合行政执法局)/g;
const COMPANY_HINT_RE =
  /(公司|厂|店|中心|超市|幼儿园|服务部|工作室|合作社|集团|企业|商行|馆|站|园|餐厅|饭店|酒楼|餐馆|酒馆)/;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * 个别政府站点存在未闭合的 <style>/<script>。直接按正则删除成对标签，
 * 会把后续正文一起吞掉；标签数量不平衡时只去掉标签本身，保留正文。
 */
function stripBlockTag(input: string, tag: "style" | "script"): string {
  const openRe = new RegExp(`<${tag}\\b`, "gi");
  const closeRe = new RegExp(`</${tag}>`, "gi");
  const opens = (input.match(openRe) ?? []).length;
  const closes = (input.match(closeRe) ?? []).length;
  if (opens === 0) return input;
  if (opens !== closes) {
    return input.replace(new RegExp(`</?${tag}\\b[^>]*>`, "gi"), " ");
  }
  return input.replace(
    new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, "gi"),
    " ",
  );
}

function decodeHtml(input: string): string {
  return stripBlockTag(stripBlockTag(input, "style"), "script")
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
 * 保留段落边界的纯文本。用于按“一、……”或公司信息段落切块。
 */
function htmlToText(html: string): string {
  return decodeHtml(
    stripBlockTag(html, "style")
      .replace(/<script[\s\S]*?<\/script>/gi, "\n")
      .replace(/<(?:br|\/p|\/div|\/li|\/tr|\/h[1-6])\s*\/?>/gi, "\n"),
  )
    .replace(/<[^>]+>/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t\u00a0]+/g, " ").trim())
    .filter((line) => line !== "")
    .join("\n");
}

function parseDate(value: string): string | null {
  const match =
    /(20\d{2})[./年-](\d{1,2})[./月-](\d{1,2})/.exec(value) ??
    // 吉林等省的附件把日期写成紧凑的 20260820。
    /^(20\d{2})(\d{2})(\d{2})$/.exec(value.trim());
  if (!match) return null;
  return `${match[1]}-${pad2(Number(match[2]))}-${pad2(Number(match[3]))}`;
}

function parsePublishedAt(html: string, fallback?: string): string {
  if (fallback) return fallback;

  const text = htmlToText(html);
  const match =
    /(?:发布日期|发布时间|时间)[：:]\s*(20\d{2})[./年-](\d{1,2})[./月-](\d{1,2})/.exec(
      text,
    );

  if (!match) {
    throw new Error("无法从页面提取发布日期，且来源未配置 publishedAt");
  }

  return `${match[1]}-${pad2(Number(match[2]))}-${pad2(Number(match[3]))}`;
}

/**
 * Word 导出的表格常把数字拆成多个 span，去标签后会留下空格：
 * `19 . 1064 万元`。这里只修补数字与单位之间的空格，不改变语义。
 */
function normalizeNumericText(text: string): string {
  return text
    .replace(/(\d)\s*\.\s*(\d)/g, "$1.$2")
    .replace(/(\d)\s+(万元|元)/g, "$1$2")
    .replace(/(\d)\s+(名)/g, "$1$2");
}

function parseAmount(text: string): number | undefined {
  const normalized = normalizeNumericText(text);
  const match = /拖欠[^。]{0,120}?([\d]+(?:\.[\d]+)?)\s*(万元|元)/.exec(
    normalized,
  );
  if (!match) return undefined;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;

  return Math.round(amount * (match[2] === "万元" ? 10000 : 1));
}

function parseWorkerCount(text: string): number | undefined {
  const normalized = normalizeNumericText(text);
  const match =
    /拖欠[^。\n]{0,50}?(\d+)\s*名/.exec(normalized) ??
    /(\d+)\s*名(?:劳动|农民|员工|职工|劳动者|农民工)/.exec(normalized);
  if (!match) return undefined;

  const count = Number(match[1]);
  return Number.isInteger(count) && count > 0 ? count : undefined;
}

function violationSentence(text: string): string {
  const sentences = text
    .split("。")
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const withNumbers = sentences.find(
    (sentence) =>
      /拖欠/.test(sentence) &&
      /(\d+\s*名|[\d.]+\s*(?:万元|元))/.test(sentence),
  );

  const violation = withNumbers ?? sentences.find((s) => /拖欠/.test(s));
  return (violation ?? "").slice(0, 240);
}

function detectStage(text: string): {
  stage?: string;
  stageLabel?: string;
} {
  if (
    /移送[^。]{0,40}公安|涉嫌拒不支付劳动报酬/.test(text)
  ) {
    return { stage: "移送公安机关", stageLabel: "移送公安" };
  }
  if (/行政处罚决定/.test(text)) {
    return { stage: "行政处罚", stageLabel: "行政处罚" };
  }
  if (/行政处理决定/.test(text)) {
    return { stage: "行政处理", stageLabel: "行政处理" };
  }
  if (/列入拖欠农民工工资失信联合惩戒对象名单/.test(text)) {
    return {
      stage: "列入拖欠农民工工资失信联合惩戒对象名单",
      stageLabel: "列入失信名单",
    };
  }
  if (/责令/.test(text)) {
    return { stage: "责令改正", stageLabel: "责令改正" };
  }
  return {};
}

function lastAuthority(text: string): string | undefined {
  const matches = Array.from(text.matchAll(AUTHORITY_RE));
  return matches.at(-1)?.[0];
}

function cityFromAuthority(authority: string | undefined): string | undefined {
  if (!authority) return undefined;

  const match =
    /^([\u4e00-\u9fa5]{2,12}?(?:市|自治州|地区|盟))/.exec(authority) ??
    /^([\u4e00-\u9fa5]{2,12}?(?:县|区))/.exec(authority);

  return match?.[1];
}

function lastDate(text: string): string | undefined {
  const matches = Array.from(text.matchAll(DATE_RE));
  const last = matches.at(-1);
  if (!last) return undefined;
  return `${last[1]}-${pad2(Number(last[2]))}-${pad2(Number(last[3]))}`;
}

function dateFromMatch(match: RegExpMatchArray): string {
  return `${match[1]}-${pad2(Number(match[2]))}-${pad2(Number(match[3]))}`;
}

/**
 * 决定日期不是“段落里最后一个日期”。
 * 例如福建案例里先写 6 月 23 日作出决定，再写 6 月 30 日前支付，
 * 后者是履行期限，不是决定日期。
 */
function decisionDate(text: string, stage?: string): string | undefined {
  const sentences = text
    .split("。")
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const keyword = stage?.includes("移送")
    ? "移送"
    : stage?.includes("行政处罚")
      ? "行政处罚决定"
      : stage?.includes("行政处理")
        ? "行政处理决定"
        : null;

  const preferred = keyword
    ? sentences.filter((sentence) => sentence.includes(keyword))
    : [];
  const fallback = sentences.filter((sentence) =>
    /(作出|下达|移送|列入)/.test(sentence),
  );

  // 优先取“关键词之前最近的一个日期”。
  // 同一句里可能同时出现处理决定日期、处罚决定日期和履行期限。
  if (keyword && preferred.length > 0) {
    for (const sentence of preferred) {
      const keywordIndex = sentence.indexOf(keyword);
      const dates = Array.from(sentence.matchAll(DATE_RE));
      const beforeKeyword = dates.filter(
        (date) => keywordIndex >= 0 && (date.index ?? 0) < keywordIndex,
      );
      const chosen = beforeKeyword.at(-1) ?? dates[0];
      if (chosen) return dateFromMatch(chosen);
    }

    // 有明确处理阶段但找不到决定日期时，不拿投诉日期冒充决定日期。
    return undefined;
  }

  for (const sentence of fallback) {
    const dates = Array.from(sentence.matchAll(DATE_RE));
    if (dates[0]) return dateFromMatch(dates[0]);
  }

  return lastDate(text);
}

function isCaseHeading(line: string): boolean {
  return (
    /^[一二三四五六七八九十百]+\s*[、.．]/.test(line) ||
    /(拖欠劳动报酬案|拖欠工资案|重大劳动保障违法行为|拒不支付劳动报酬案)\s*$/.test(
      line,
    ) ||
    // 无编号的小标题也可能以“××公司……案”单独成行。
    /^.{0,80}(?:公司|厂|店|中心|集团).{0,40}案\s*$/.test(line)
  );
}

function extractDecisionNo(text: string): string | undefined {
  const match =
    /[\u4e00-\u9fa5]{0,12}决字〔20\d{2}〕[^，。；\s]{0,40}?号/.exec(text);
  return match?.[0];
}

function extractLegalRep(text: string): string | undefined {
  const match = /法定代表人[：:]\s*([\u4e00-\u9fa5]{2,4})/.exec(text);
  return match?.[1];
}

function normalizeHeading(line: string): string {
  const cleaned = line
    .replace(/^[一二三四五六七八九十百]+\s*[、.．]\s*/, "")
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/[（(][^）)]*$/, "")
    .replace(/拖欠劳动报酬案.*$/, "")
    .replace(/拖欠工资案.*$/, "")
    .replace(/重大劳动保障违法行为.*$/, "")
    .replace(/[，,；;：:\s]+$/, "")
    .trim();

  // 部分省份的小标题混在叙述句里（如“经查，某某公司”），
  // 取最后一个分句并去掉常见引导词，再抽取以主体类型词结尾的名称。
  const tail =
    cleaned
      .split(/[，,。；;：:]/)
      .pop()
      ?.replace(
        /^(?:称|系|为|该公司|该单位|该工程总承包单位|该项目建设单位|建设单位|施工总承包单位|总承包单位|用人单位|经查实|经核实|经查)(?:为|系|是)?/,
        "",
      )
      .trim() ?? cleaned;
  const match =
    /([\u4e00-\u9fa5A-Za-z0-9（）()·]{4,60}(?:公司|厂|店|中心|超市|幼儿园|服务部|工作室|合作社|集团|商行|馆|站|企业))$/.exec(
      tail,
    );

  return (match?.[1] ?? tail).trim();
}

/**
 * 公司名清洗。不同省份的公告会带不同前缀、序号和附加字段：
 * - 北京：“单位名称：北京某某有限公司，负责人：某某”
 * - 陕西：“1 汉中市某某有限公司”
 * 只保留主体名称，避免把“单位名称”“负责人”写进企业名。
 */
function normalizeCompanyName(raw: string): string {
  const cleaned = raw
    .replace(
      /^(单位名称|企业名称|公司名称|用人单位|违法主体全称|违法主体|被公布单位)\s*[：:]\s*/,
      "",
    )
    .replace(/^\d{1,3}\s*[、.．]?\s+/, "")
    .split(/[，,]\s*(?:法定代表人|负责人|地址|住所)/)[0]
    .split(/统一(?:社会)?信用代码?/)[0]
    .replace(/[（(](?:分包|建设单位|施工总承包单位|用人单位)[）)]\s*$/, "")
    // 部分公告把“基本情况”混进标题，不能带进企业主体名称。
    .replace(/基本情况$/, "")
    .replace(/\s+/g, "")
    .replace(/[，,；;：:（(]+$/, "")
    .trim();

  // 叙述句里夹带公司名时，取最后一个分句并抽取主体名称。
  const tail =
    cleaned
      .split(/[，,。；;：:]/)
      .pop()
      ?.replace(
        /^(?:称|系|为|该公司|该单位|该工程总承包单位|该项目建设单位|建设单位|施工总承包单位|总承包单位|用人单位|经查实|经核实|经查)(?:为|系|是)?/,
        "",
      )
      .trim() ?? cleaned;
  const match =
    /([\u4e00-\u9fa5A-Za-z0-9（）()·]{4,60}(?:公司|厂|店|中心|超市|幼儿园|服务部|工作室|合作社|集团|商行|馆|站|企业))$/.exec(
      tail,
    );

  return (match?.[1] ?? cleaned).trim();
}

/**
 * 是否为“像企业名”的单元格。地址里常出现“园/中心”等词，
 * 因此要求名称以主体类型词结尾，避免把注册地址当成企业名。
 */
function looksLikeCompany(value: string): boolean {
  const trimmed = value.replace(/[（(][^）)]*[）)]\s*$/, "");
  return (
    trimmed.length >= 4 &&
    COMPANY_HINT_RE.test(trimmed) &&
    /(公司|厂|店|中心|超市|幼儿园|服务部|工作室|合作社|集团|商行|馆|站|企业)$/.test(
      trimmed,
    )
  );
}

/**
 * Word 导出的页面常出现嵌套 `<table>`，按 `<table>...</table>` 匹配会
 * 在外层表格的第一个内层结束标签处截断。这里直接扫描所有 `<tr>`，
 * 只保留真正含企业信用代码的数据行，避免依赖表格层级。
 */
function extractTableRows(html: string): string[][] {
  const rows: string[][] = [];

  for (const row of html.matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
    const cells = Array.from(
      row[0].matchAll(/<t[dh][\s\S]*?<\/t[dh]>/gi),
    ).map((cell) => stripCellTags(cell[0]));

    if (cells.length > 0) rows.push(cells);
  }

  return rows;
}

function compact(value: string): string {
  return value.replace(/\s+/g, "");
}

/**
 * 表格单元格专用：Word 会把一个信用代码拆进多个 `<span>`，
 * 若把标签替换成空格会得到 `91 410800...`。这里只把 `<br>` 视为空格，
 * 其余标签直接去掉，保证同一单元格内的文本连续。
 */
function stripCellTags(input: string): string {
  return decodeHtml(input)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t\u00a0]+/g, " ")
    .trim();
}

/**
 * 附件型名单（docx 表格）：单元格按制表符展开，信用代码是稳定锚点。
 * 适用于人社部统一模板的“失信联合惩戒对象名单”表格。
 */
export function parseTextTableCases(text: string): ParseResult {
  const tokens = text
    .split(/[\t\n\r]+/)
    .map((token) => token.trim())
    .filter(Boolean);

  const cases: ParsedCase[] = [];
  const warnings: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    if (!CODE_RE.test(tokens[index])) continue;
    const creditCode = CODE_RE.exec(tokens[index])?.[0];
    if (!creditCode) continue;

    let name = "";
    for (let offset = 1; offset <= 4; offset += 1) {
      const candidate = tokens[index - offset] ?? "";
      if (
        candidate.length >= 4 &&
        COMPANY_HINT_RE.test(candidate) &&
        !CODE_RE.test(candidate) &&
        !/(法人及非法人组织|非法人组织|自然人)/.test(candidate)
      ) {
        name = normalizeCompanyName(candidate);
        break;
      }
    }

    if (!name) {
      warnings.push(`第 ${index + 1} 个单元格：无法识别公司名，已跳过`);
      continue;
    }

    const violation = tokens[index + 3] ?? "";
    const blockText = tokens.slice(index, index + 9).join(" ");
    const caseWarnings: string[] = [];

    const amountYuan =
      parseAmount(violation) ?? parseAmount(tokens[index + 4] ?? "");
    const workerCount =
      parseWorkerCount(violation) ?? parseWorkerCount(tokens[index + 5] ?? "");
    const listedAt = parseDate(tokens[index + 6] ?? "");
    const authority = lastAuthority(blockText);

    if (!violation) caseWarnings.push(`${name}：未解析到违法事实`);
    if (amountYuan === undefined) caseWarnings.push(`${name}：未解析到欠薪金额`);
    if (workerCount === undefined) caseWarnings.push(`${name}：未解析到欠薪人数`);
    if (!authority) caseWarnings.push(`${name}：未解析到决定机关`);

    cases.push({
      name,
      creditCode,
      legalRep: tokens[index + 1],
      violation: violation || "拖欠劳动者劳动报酬",
      workerCount,
      amountYuan,
      authority,
      decisionNo: tokens[index + 2],
      listedAt: listedAt ?? undefined,
      expiresAt: parseDate(tokens[index + 8] ?? "") ?? undefined,
      stage: "列入拖欠农民工工资失信联合惩戒对象名单",
      stageLabel: "列入失信名单",
      stageDate: listedAt ?? undefined,
      city: cityFromAuthority(authority),
      warnings: caseWarnings,
    });
  }

  warnings.push(...cases.flatMap((item) => item.warnings));
  return { cases, warnings };
}


/**
 * 老版 Word（.doc）附件没有可直接读取的行列结构，只能拿到以制表符/换行
 * 分隔的文本。这里以 18 位信用代码为锚点：向前找企业名称（优先以
 * “公司/厂/中心”等主体后缀结尾的片段，避免误取地址），向后找违法事实。
 * 适用于“序号/企业名称/…/信用代码/主要违法事实/处理情况”的省级模板。
 */
export function parseLegacyDocCases(
  text: string,
  stage = "重大劳动保障违法行为社会公布",
  stageLabel = "社会公布",
): ParseResult {
  const tokens = text
    .split(/[\t\n\r]+/)
    .map((token) => token.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const cases: ParsedCase[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const companySuffix =
    /(?:有限责任公司|股份有限公司|有限公司|公司|集团|厂|中心|超市|幼儿园|服务部|经营部|工作室|合作社|商行|店|馆)$/;

  for (let index = 0; index < tokens.length; index += 1) {
    const creditCode = CODE_RE.exec(tokens[index])?.[0];
    if (!creditCode || seen.has(creditCode)) continue;

    let name = "";
    for (let offset = 1; offset <= 6; offset += 1) {
      const candidate = normalizeCompanyName(tokens[index - offset] ?? "");
      if (candidate.length < 4 || CODE_RE.test(candidate)) continue;
      if (companySuffix.test(candidate)) {
        name = candidate;
        break;
      }
    }

    if (!name) {
      // 附件表格末尾常附“认定部门代码”（也是 18 位），它不是企业主体，
      // 不必为它产生噪声警告。
      const nearby = tokens.slice(Math.max(0, index - 6), index + 2).join(" ");
      if (!/认定部门|行政部门|人力资源和社会保障局/.test(nearby)) {
        warnings.push(`第 ${index + 1} 个单元格：无法识别公司名，已跳过`);
      }
      continue;
    }

    let violation = "";
    for (let offset = 1; offset <= 6; offset += 1) {
      const candidate = tokens[index + offset] ?? "";
      if (CODE_RE.test(candidate)) break;
      if (
        candidate.length >= 8 &&
        /(拖欠|欠薪|未依法|拒不|违法)/.test(candidate)
      ) {
        violation = candidate;
        break;
      }
    }

    const blockText = tokens
      .slice(Math.max(0, index - 3), index + 8)
      .join(" ");
    const authority = lastAuthority(blockText);
    const legalRep = /法定代表人(?:或负责人|或相关责任人)?\s*[：:]\s*([\u4e00-\u9fa5·]{2,12})/.exec(
      blockText,
    )?.[1];

    const caseWarnings: string[] = [];
    if (!violation) caseWarnings.push(`${name}：未解析到违法事实`);
    if (!authority) caseWarnings.push(`${name}：未解析到决定机关`);

    const amountYuan = parseAmount(violation);
    const workerCount = parseWorkerCount(violation);
    if (amountYuan === undefined) caseWarnings.push(`${name}：未解析到欠薪金额`);
    if (workerCount === undefined) caseWarnings.push(`${name}：未解析到欠薪人数`);

    seen.add(creditCode);
    cases.push({
      name,
      creditCode,
      legalRep,
      violation: violation || "拖欠劳动者劳动报酬",
      workerCount,
      amountYuan,
      authority,
      stage,
      stageLabel,
      city: cityFromAuthority(authority),
      warnings: caseWarnings,
    });
  }

  warnings.push(...cases.flatMap((item) => item.warnings));
  return { cases, warnings };
}

export function parseTableCases(html: string): ParseResult {
  const cases: ParsedCase[] = [];
  const warnings: string[] = [];

  let rowNumber = 0;

  for (const cells of extractTableRows(html)) {
    rowNumber += 1;
    const codeIndex = cells.findIndex((cell) => CODE_RE.test(cell));

    // 公告表格偶尔会出现“序号 + 违法事实 + 决定书号，但企业名称/信用代码
    // 被排版吞掉”的残缺行。不能猜测主体，只能跳过并留下警告。
    if (
      codeIndex < 1 &&
      /^\d+$/.test((cells[0] ?? "").trim()) &&
      /拖欠/.test(cells.join(" "))
    ) {
      warnings.push(
        `表格第 ${rowNumber} 行：企业名称或信用代码缺失，已跳过，不写入猜测主体`,
      );
    }

    if (codeIndex < 1) continue;

    const codeMatch = CODE_RE.exec(cells[codeIndex]);
    const creditCode = codeMatch?.[0];
    let name = normalizeCompanyName((cells[codeIndex - 1] ?? "").trim());

    // 有些表格把“注册地址”排在信用代码前一格（如河北区县公告），
    // 此时需要向前多找一格才能拿到违法主体名称。
    if (!looksLikeCompany(name)) {
      for (let offset = 2; offset <= 3; offset += 1) {
        const candidate = normalizeCompanyName(
          (cells[codeIndex - offset] ?? "").trim(),
        );
        if (looksLikeCompany(candidate)) {
          name = candidate;
          break;
        }
      }
    }

    if (!creditCode || name.length < 4 || !COMPANY_HINT_RE.test(name)) {
      continue;
    }

    const caseWarnings: string[] = [];
    const violationIndex = cells.findIndex(
      (cell, index) =>
        index > codeIndex &&
        cell.length > 5 &&
        /(拖欠|欠薪|未依法|违法)/.test(cell),
    );
    const violation = violationIndex >= 0 ? cells[violationIndex] : "";
    if (!violation) caseWarnings.push(`${name}：未解析到违法事实`);

    const authorityIndex = cells.findIndex(
      (cell, index) =>
        index > violationIndex &&
        /(人力资源|人社局|劳动保障|行政执法)/.test(compact(cell)) &&
        !/决字|号$/.test(compact(cell)),
    );
    const authority =
      authorityIndex >= 0
        ? cells[authorityIndex]
        : lastAuthority(cells.join(" "));
    if (!authority) caseWarnings.push(`${name}：未解析到决定机关`);

    const decisionIndex = cells.findIndex(
      (cell, index) =>
        index > authorityIndex && /决字|号/.test(compact(cell)),
    );
    const decisionNo =
      decisionIndex >= 0 ? cells[decisionIndex] : undefined;

    const dates = cells
      .map((cell) => parseDate(cell))
      .filter((value): value is string => Boolean(value));
    const listedAt = dates[0];
    const expiresAt = dates[1];

    const legalRepCandidate = cells[codeIndex + 1] ?? "";
    const legalRep =
      legalRepCandidate && !legalRepCandidate.includes("***")
        ? legalRepCandidate
        : undefined;

    const workerCount = parseWorkerCount(violation);
    const amountYuan = parseAmount(violation);
    if (workerCount === undefined) {
      caseWarnings.push(`${name}：未解析到欠薪人数`);
    }
    if (amountYuan === undefined) {
      caseWarnings.push(`${name}：未解析到欠薪金额`);
    }

    cases.push({
      name,
      creditCode,
      legalRep,
      violation: violation || "拖欠劳动者劳动报酬",
      workerCount,
      amountYuan,
      authority,
      decisionNo,
      listedAt,
      expiresAt,
      stage: "列入拖欠农民工工资失信联合惩戒对象名单",
      stageLabel: "列入失信名单",
      stageDate: listedAt,
      city: cityFromAuthority(authority),
      warnings: caseWarnings,
    });
  }

  warnings.push(...cases.flatMap((item) => item.warnings));
  return { cases, warnings };
}

/**
 * 段落来源（湖北、福建）：以“统一社会信用代码”为锚点，
 * 向上找公司名/小标题，向下取同一案件的事实段落。
 */
export function parseParagraphCases(html: string): ParseResult {
  const lines = htmlToText(html).split("\n");
  const codeLineIndexes = lines
    .map((line, index) => (CODE_RE.test(line) ? index : -1))
    .filter((index) => index >= 0);

  const cases: ParsedCase[] = [];
  const warnings: string[] = [];

  for (let index = 0; index < codeLineIndexes.length; index += 1) {
    const lineIndex = codeLineIndexes[index];
    const nextLineIndex = codeLineIndexes[index + 1] ?? lines.length;
    const line = lines[lineIndex] ?? "";
    const codeMatch = CODE_RE.exec(line);
    const creditCode = codeMatch?.[0];
    if (!creditCode) continue;

    const beforeCode = line
      .slice(0, codeMatch.index)
      .split("统一社会信用代码")[0]
      .replace(/[，,；;：:\s]+$/, "")
      .trim();

    const headingLine =
      lines[lineIndex - 1] && !CODE_RE.test(lines[lineIndex - 1])
        ? lines[lineIndex - 1]
        : lines[lineIndex - 2] ?? "";
    const headingName = normalizeHeading(headingLine);

    const name =
      beforeCode.length >= 4 && COMPANY_HINT_RE.test(beforeCode)
        ? normalizeCompanyName(beforeCode)
        : normalizeCompanyName(headingName);

    if (name.length < 4 || !COMPANY_HINT_RE.test(name)) {
      warnings.push(`第 ${lineIndex + 1} 行：无法识别公司名，已跳过`);
      continue;
    }

    // 从当前案件的小标题开始，到下一个案件小标题之前结束。
    // 不能把上一条案件的结论段落算进来，否则人数、金额、机关都会错位。
    let contextStart = lineIndex;
    for (let cursor = lineIndex; cursor >= Math.max(0, lineIndex - 6); cursor -= 1) {
      if (isCaseHeading(lines[cursor] ?? "")) {
        contextStart = cursor;
        break;
      }
    }

    let contextEnd = Math.min(lines.length, lineIndex + 10, nextLineIndex);
    for (let cursor = lineIndex + 1; cursor < contextEnd; cursor += 1) {
      if (isCaseHeading(lines[cursor] ?? "")) {
        contextEnd = cursor;
        break;
      }
    }

    const blockText = lines
      .slice(contextStart, contextEnd)
      .join("\n")
      .replace(/\s+/g, " ")
      .trim();

    const violation = violationSentence(blockText);
    const workerCount = parseWorkerCount(blockText);
    const amountYuan = parseAmount(blockText);
    const authority = lastAuthority(blockText);
    const stage = detectStage(blockText);
    const stageDate = decisionDate(blockText, stage.stage);
    const decisionNo = extractDecisionNo(blockText);
    const legalRep = extractLegalRep(blockText);

    const caseWarnings: string[] = [];
    if (!violation) caseWarnings.push(`${name}：未解析到违法事实`);
    if (workerCount === undefined) {
      caseWarnings.push(`${name}：未解析到欠薪人数`);
    }
    if (amountYuan === undefined) {
      caseWarnings.push(`${name}：未解析到欠薪金额`);
    }
    if (!authority) caseWarnings.push(`${name}：未解析到决定机关`);

    cases.push({
      name,
      creditCode,
      legalRep,
      violation: violation || "拖欠劳动者劳动报酬",
      workerCount,
      amountYuan,
      authority,
      decisionNo,
      stage: stage.stage,
      stageLabel: stage.stageLabel,
      stageDate,
      city: cityFromAuthority(authority),
      warnings: caseWarnings,
    });
  }

  warnings.push(...cases.flatMap((item) => item.warnings));
  return { cases, warnings };
}

/**
 * 部分省级“失信名单”附件只有企业名称、没有统一社会信用代码
 * （如湖南的季度汇总表）。这里以“企业名称 + 法定代表人”相邻出现作为
 * 记录锚点，向后取列入事由、金额、列入日期、认定部门与文书号。
 */
export function parseNameListCases(
  text: string,
  stage = "列入拖欠农民工工资失信联合惩戒对象名单",
  stageLabel = "列入失信名单",
): ParseResult {
  const tokens = text
    .split(/[\t\n\r]+/)
    .map((token) => token.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const cases: ParsedCase[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const companySuffix =
    /(?:有限责任公司|股份有限公司|有限公司|公司|集团|厂|中心|超市|幼儿园|服务部|经营部|工作室|合作社|商行|店|馆|酒吧)$/;
  // 湖南等省的汇总表在表头标注金额单位为万元，需按 1 万元 = 10000 元换算。
  const amountInWan = /涉及金额[\s\S]{0,8}万元/.test(text);

  for (let index = 0; index < tokens.length; index += 1) {
    const candidate = normalizeCompanyName(tokens[index]);
    if (
      candidate.length < 4 ||
      !companySuffix.test(candidate) ||
      CODE_RE.test(candidate) ||
      seen.has(candidate)
    ) {
      continue;
    }

    const legalRep = tokens[index + 1] ?? "";
    // 记录锚点必须紧跟一个人名，避免把标题、说明文字误判为企业。
    if (!/^[\u4e00-\u9fa5·]{2,6}$/.test(legalRep)) continue;

    const window = tokens.slice(index + 1, index + 12);
    let violation = "";
    let amountYuan: number | undefined;
    let listedAt: string | undefined;
    let expiresAt: string | undefined;
    let authority: string | undefined;
    let decisionNo: string | undefined;

    for (const token of window) {
      if (!violation && /^(?:拖欠|欠薪|拒不)/.test(token)) {
        violation = token;
        continue;
      }
      if (amountYuan === undefined && /^\d+(?:\.\d+)?$/.test(token)) {
        const numeric = Number(token);
        if (Number.isFinite(numeric) && numeric > 0) {
          amountYuan = Math.round(numeric * (amountInWan ? 10000 : 1));
        }
        continue;
      }
      if (!authority) {
        authority = AUTHORITY_RE.exec(token)?.[0];
      }
      if (!decisionNo && /决字/.test(token)) {
        decisionNo = token;
        continue;
      }
      const date = parseDate(token);
      if (date) {
        if (!listedAt) listedAt = date;
        else if (!expiresAt) expiresAt = date;
      }
    }

    seen.add(candidate);
    cases.push({
      name: candidate,
      legalRep,
      violation: violation || "拖欠农民工工资",
      amountYuan,
      authority,
      decisionNo,
      listedAt,
      expiresAt,
      stage,
      stageLabel,
      stageDate: listedAt,
      city: cityFromAuthority(authority),
      warnings: [],
    });
  }

  if (cases.length === 0) {
    warnings.push("名单附件中未识别到“企业名称 + 法定代表人”形式的记录");
  }

  return { cases, warnings };
}

/**
 * 重大劳动保障违法案件正文里的非欠薪案件（如未经许可职业中介）
 * 不属于欠薪信号，导入前按违法事实过滤，避免 subtype 误标。
 */
export function parseWageParagraphCases(html: string): ParseResult {
  // 先按“一、二、三……”小标题切块，丢掉非欠薪案件（如未经许可职业中介），
  // 再交给段落解析器，避免默认违法事实把非欠薪案件误算成欠薪信号。
  const lines = htmlToText(html).split("\n");
  const keptLines: string[] = [];
  let keepBlock = true;

  for (const line of lines) {
    if (isCaseHeading(line)) {
      // 只保留欠薪类案件：工资保证金、社保登记、工时、职业中介等
      // 虽然也属于劳动保障违法，但不能标成“欠薪”信号。
      keepBlock =
        /拖欠[^案]{0,24}(?:工资|劳动报酬)|未清偿[^案]{0,16}工资|拒不支付劳动报酬/.test(
          line,
        );
    }
    if (keepBlock) keptLines.push(line);
  }

  return parseParagraphCases(keptLines.join("\n"));
}

export function dedupeCases(cases: ParsedCase[]): {
  cases: ParsedCase[];
  duplicates: number;
} {
  const seen = new Set<string>();
  const unique: ParsedCase[] = [];
  let duplicates = 0;

  for (const item of cases) {
    const key = item.creditCode ?? item.name;
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    unique.push(item);
  }

  return { cases: unique, duplicates };
}

function buildCompanyEntry(
  item: ParsedCase,
  source: SourceConfig,
  publishedAt: string,
  fetchedAt: string,
  ingestRun: IngestRunMeta,
) {
  const period = (
    item.listedAt ??
    item.stageDate ??
    publishedAt
  ).slice(0, 4);

  const value: Record<string, unknown> = {
    count: 1,
    subtype: "wage_arrears",
    violation: item.violation,
  };

  if (item.workerCount !== undefined) value.workerCount = item.workerCount;
  if (item.amountYuan !== undefined) value.amountYuan = item.amountYuan;
  if (item.authority) value.authority = item.authority;
  if (item.decisionNo) value.decisionNo = item.decisionNo;
  if (item.legalRep) value.legalRep = item.legalRep;
  if (item.stage) value.stage = item.stage;
  if (item.stageLabel) value.stageLabel = item.stageLabel;
  if (item.stageDate) value.stageDate = item.stageDate;
  if (item.listedAt) value.listedAt = item.listedAt;
  if (item.expiresAt) value.expiresAt = item.expiresAt;

  return {
    company: {
      name: item.name,
      aliases: [] as string[],
      creditCode: item.creditCode ?? null,
      province: source.region,
      city: item.city ?? null,
      industry: null,
      depth: 0,
    },
    signals: [
      {
        type: "labor_violation",
        period,
        severity: "high",
        value,
        sourceUrl: source.url,
        sourceTitle: source.name,
        sourcePublishedAt: publishedAt,
        fetchedAt,
        snapshotFile: source.snapshotFile,
        ingestRunId: ingestRun.id,
        parserVersion: ingestRun.parserVersion,
      },
    ],
  };
}

function buildOutput(
  source: SourceConfig,
  publishedAt: string,
  fetchedAt: string,
  cases: ParsedCase[],
  ingestRun: IngestRunMeta,
) {
  return {
    source: {
      key: source.key,
      name: source.name,
      category: "labor_violation",
      level: "A",
      region: source.region,
      baseUrl: `${new URL(source.url).origin}/`,
      accessType: "public_web",
      fetchMode: "script",
      reviewCycleDays: 30,
      enabled: true,
      notes:
        "官方主动公开公告；脚本仅抓取公告页并保存快照，不绕过登录/验证码，不使用需要 appKey 的接口。",
    },
    announcement: {
      title: source.name,
      url: source.url,
      publishedAt,
      fetchedAt,
      snapshotFile: source.snapshotFile,
    },
    ingestRun,
    companies: cases.map((item) =>
      buildCompanyEntry(item, source, publishedAt, fetchedAt, ingestRun),
    ),
  };
}

async function writeJsonIfChanged(
  file: string,
  data: unknown,
): Promise<boolean> {
  const absolute = path.resolve(process.cwd(), file);
  const content = `${JSON.stringify(data, null, 2)}\n`;

  await mkdir(path.dirname(absolute), { recursive: true });

  try {
    const existing = await readFile(absolute, "utf8");
    if (existing === content) return false;
  } catch {
    // 文件不存在时直接写入。
  }

  await writeFile(absolute, content, "utf8");
  return true;
}

/**
 * 部分省级站点会拒绝自报身份的采集 UA。这里先用约定的采集标识，
 * 失败后回落到常规浏览器 UA 重试一次；仍然只读取公开页面，不绕过验证码。
 */
const USER_AGENTS = [
  "zhi-gu-wen-data-ingest/0.1 (+public-announcement-reader)",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
];

async function fetchOnce(
  url: string,
  userAgent: string,
): Promise<{ html: string; status: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": userAgent,
        accept: "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    return { html: await response.text(), status: response.status };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchHtml(
  url: string,
): Promise<{ html: string; status: number }> {
  let lastError: unknown;

  for (const userAgent of USER_AGENTS) {
    try {
      return await fetchOnce(url, userAgent);
    } catch (error) {
      lastError = error;
    }
  }

  // 少数站点会按 TLS 指纹拒绝 Node 内置 fetch，退回到系统 curl 再试一次。
  try {
    const html = await fetchWithCurl(url);
    if (html.length > 0) return { html, status: 200 };
  } catch (error) {
    lastError = error;
  }

  throw lastError;
}

function fetchWithCurl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "curl",
      ["-sL", "--max-time", "25", "-A", USER_AGENTS[1], url],
      { maxBuffer: 32 * 1024 * 1024, encoding: "utf8" },
      (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      },
    );
  });
}

async function fetchBytes(
  url: string,
): Promise<{ buffer: Buffer; status: number }> {
  let lastError: unknown;

  for (const userAgent of USER_AGENTS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { "user-agent": userAgent },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      return {
        buffer: Buffer.from(await response.arrayBuffer()),
        status: response.status,
      };
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}

/** 读取 ZIP 中的单个文件（docx 本质是 zip）。 */
function readZipEntry(buffer: Buffer, entryName: string): Buffer | null {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return null;

  const count = buffer.readUInt16LE(eocd + 10);
  const cdOffset = buffer.readUInt32LE(eocd + 16);
  let cursor = cdOffset;

  for (let index = 0; index < count; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) return null;
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);

    if (name === entryName) {
      const localNameLength = buffer.readUInt16LE(localOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLength + localExtraLength;
      const data = buffer.subarray(start, start + compressedSize);
      return method === 0 ? data : inflateRawSync(data);
    }

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return null;
}

/**
 * 老版 Office（Word 97-2003 .doc / Excel 97-2003 .xls）是 OLE2 复合文档，
 * 文件头固定为 D0 CF 11 E0 A1 B1 1A E1。部分省级站点会把这类文件
 * 直接标成 .docx/.xlsx 发布，因此不能只看扩展名。
 */
export function isOle2Buffer(buffer: Buffer): boolean {
  return (
    buffer.length >= 8 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0 &&
    buffer[4] === 0xa1 &&
    buffer[5] === 0xb1 &&
    buffer[6] === 0x1a &&
    buffer[7] === 0xe1
  );
}

/** 从 Word 97-2003 .doc 提取正文纯文本（保留制表符与换行）。 */
export async function legacyDocToText(buffer: Buffer): Promise<string> {
  const extractor = new WordExtractor();
  const document = await extractor.extract(buffer);
  return document.getBody();
}

/** 按文件头把 Word 附件转成纯文本：OLE2 走老版解析，ZIP 走 docx。 */
export async function documentToText(buffer: Buffer): Promise<string> {
  return isOle2Buffer(buffer) ? legacyDocToText(buffer) : docxToText(buffer);
}

/** 从 docx 提取正文纯文本，保留段落与表格单元格换行。 */
export function docxToText(buffer: Buffer): string {
  const xml = readZipEntry(buffer, "word/document.xml")?.toString("utf8") ?? "";
  if (!xml) throw new Error("docx 中未找到 word/document.xml");

  return xml
    .replace(/<w:tab[^>]*\/>/g, "\t")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<\/w:tc>/g, "\t")
    .replace(/<\/w:tr>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/HYPERLINK\s+"[^"]*"\s*\\t\s*"[^"]*"/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function columnIndex(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref)?.[1] ?? "";
  let index = 0;
  for (const letter of letters) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }
  return index - 1;
}

/** 读取 xlsx 首个工作表为二维文本数组。 */
export function xlsxToRows(buffer: Buffer): string[][] {
  const sharedXml =
    readZipEntry(buffer, "xl/sharedStrings.xml")?.toString("utf8") ?? "";
  const shared: string[] = [];

  for (const item of sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const parts = Array.from(
      item[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g),
    ).map((match) => decodeXmlEntities(match[1]));
    shared.push(parts.join(""));
  }

  const sheetXml =
    readZipEntry(buffer, "xl/worksheets/sheet1.xml")?.toString("utf8") ?? "";
  const rows: string[][] = [];

  for (const row of sheetXml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];

    for (const cell of row[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attributes = cell[1];
      const ref = /r="([A-Z]+\d+)"/.exec(attributes)?.[1] ?? "";
      const type = /t="([^"]+)"/.exec(attributes)?.[1];
      let value = "";

      if (type === "s") {
        const index = Number(/<v>([\s\S]*?)<\/v>/.exec(cell[2])?.[1] ?? "");
        value = shared[index] ?? "";
      } else if (type === "inlineStr") {
        value = Array.from(
          cell[2].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g),
        )
          .map((match) => decodeXmlEntities(match[1]))
          .join("");
      } else {
        value = decodeXmlEntities(
          /<v>([\s\S]*?)<\/v>/.exec(cell[2])?.[1] ?? "",
        );
      }

      const index = columnIndex(ref);
      while (cells.length < index) cells.push("");
      cells[index] = value.replace(/\s+/g, " ").trim();
    }

    if (cells.some((cell) => cell !== "")) rows.push(cells);
  }

  return rows;
}

/**
 * 表格附件统一入口：ZIP 包按现有轻量解析器读取；
 * OLE2（老版 .xls）交给 SheetJS 的 BIFF 读取器。
 */
export function spreadsheetToRows(buffer: Buffer): string[][] {
  if (!isOle2Buffer(buffer)) return xlsxToRows(buffer);

  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: "",
  });

  return rows
    .map((row) =>
      row.map((cell) => {
        if (cell instanceof Date) {
          // SheetJS 的 cellDates 按本地时区构造日期，直接 toISOString
          // 在 UTC+8 会退到前一天，这里按本地年月日格式化。
          return `${cell.getFullYear()}-${pad2(cell.getMonth() + 1)}-${pad2(
            cell.getDate(),
          )}`;
        }
        return String(cell ?? "").replace(/\s+/g, " ").trim();
      }),
    )
    .filter((row) => row.some((cell) => cell !== ""));
}

/** Excel 日期序列号转 ISO 日期。 */
function excelDateToIso(value: string): string | undefined {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 20000 || numeric > 80000) {
    return undefined;
  }
  const timestamp = Date.UTC(1899, 11, 30) + numeric * 86400000;
  return new Date(timestamp).toISOString().slice(0, 10);
}

/** 解析 xlsx 名单：按表头定位列，不依赖固定列序。 */
export function parseXlsxCases(
  buffer: Buffer,
  stage = "列入重大劳动保障违法行为社会公布",
  stageLabel = "社会公布",
): ParseResult {
  const rows = spreadsheetToRows(buffer);
  const headerIndex = rows.findIndex(
    (row) =>
      row.some((cell) =>
        /单位名称|企业名称|公司名称|用人单位|对象名称|^名称$/.test(cell),
      ) &&
      row.some((cell) =>
        /统一社会信用代码|信用代码|工商注册号|注册号|对象证件号码|证件号码/.test(
          cell,
        ),
      ),
  );

  if (headerIndex < 0) {
    throw new Error("xlsx 中未找到表头（需要包含单位名称与统一社会信用代码）");
  }

  const header = rows[headerIndex];
  const findColumn = (pattern: RegExp) =>
    header.findIndex((cell) => pattern.test(cell));

  const nameIndex = findColumn(
    /单位名称|企业名称|公司名称|用人单位|对象名称|^名称$/,
  );
  const codeIndex = findColumn(
    /统一社会信用代码|信用代码|工商注册号|注册号|对象证件号码|证件号码/,
  );
  const violationIndex = findColumn(/违法事实|列入名单事由|列入事由/);
  const authorityIndex = findColumn(
    /公布机构|作出列入决定部门|决定部门|认定部门/,
  );
  const decisionIndex = findColumn(/文书号/);
  const listedIndex = findColumn(/列入日期/);
  const expiresIndex = findColumn(/到期日期|退出日期/);
  const legalRepIndex = findColumn(/法定代表人/);

  const cases: ParsedCase[] = [];
  const warnings: string[] = [];

  for (const row of rows.slice(headerIndex + 1)) {
    // 名单里可能混有“自然人”欠薪记录，本平台只登记用人单位主体。
    if (row.some((cell) => cell.trim() === "自然人")) continue;

    const creditCode = CODE_RE.exec(row[codeIndex] ?? "")?.[0];
    const name = normalizeCompanyName(row[nameIndex] ?? "");

    if (!creditCode || name.length < 4) continue;

    const violation = row[violationIndex] ?? "";
    const authority = row[authorityIndex] || undefined;
    const caseWarnings: string[] = [];

    const workerCount = parseWorkerCount(violation);
    const amountYuan = parseAmount(violation);
    const listedRaw = row[listedIndex] ?? "";
    const listedAt =
      excelDateToIso(listedRaw) ?? parseDate(listedRaw) ?? undefined;
    const expiresAt =
      excelDateToIso(row[expiresIndex] ?? "") ??
      parseDate(row[expiresIndex] ?? "") ??
      undefined;
    const legalRepRaw = row[legalRepIndex] ?? "";
    const legalRep = legalRepRaw
      ? legalRepRaw
          .replace(/^法定代表人[：:]\s*/, "")
          .split(/[；;]/)[0]
          .slice(0, 20)
      : undefined;

    if (!violation) caseWarnings.push(`${name}：未解析到违法事实`);
    if (workerCount === undefined) caseWarnings.push(`${name}：未解析到欠薪人数`);
    if (amountYuan === undefined) caseWarnings.push(`${name}：未解析到欠薪金额`);

    cases.push({
      name,
      creditCode,
      legalRep,
      violation: violation || "拖欠劳动者劳动报酬",
      workerCount,
      amountYuan,
      authority,
      decisionNo: decisionIndex >= 0 ? row[decisionIndex] : undefined,
      listedAt,
      expiresAt,
      stage,
      stageLabel,
      stageDate: listedAt,
      city: cityFromAuthority(authority),
      warnings: caseWarnings,
    });
  }

  warnings.push(...cases.flatMap((item) => item.warnings));
  return { cases, warnings };
}

async function readExistingFetchedAt(
  file: string,
): Promise<string | null> {
  try {
    const raw = JSON.parse(
      await readFile(path.resolve(process.cwd(), file), "utf8"),
    ) as { announcement?: { fetchedAt?: string } };
    return raw.announcement?.fetchedAt ?? null;
  } catch {
    return null;
  }
}

async function readExistingIngestRun(
  file: string,
): Promise<IngestRunMeta | null> {
  try {
    const raw = JSON.parse(
      await readFile(path.resolve(process.cwd(), file), "utf8"),
    ) as { ingestRun?: IngestRunMeta };
    return raw.ingestRun ?? null;
  } catch {
    return null;
  }
}

type SourceResult = {
  key: string;
  ok: boolean;
  cases: number;
  duplicates: number;
  warnings: number;
  written?: boolean;
  error?: string;
  ingestRunId?: string;
  names?: string[];
  warningDetails?: string[];
};

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const offline = args.includes("--offline");
  const verbose = args.includes("--verbose");
  const onlyArg = args.find((arg) => arg.startsWith("--only="));
  const only = onlyArg
    ? onlyArg
        .slice("--only=".length)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : null;

  const selected = SOURCES.filter(
    (source) =>
      !only ||
      only.some((prefix) => source.key === prefix || source.key.startsWith(prefix)),
  );

  if (selected.length === 0) {
    throw new Error(`没有匹配的数据源：${only?.join(",") ?? ""}`);
  }

  const results: SourceResult[] = [];

  for (const source of selected) {
    const startedAt = new Date().toISOString();

    try {
      let html: string;
      let httpStatus: number | null = null;
      let contentHash: string;
      const snapshotFile = source.documentFile ?? source.snapshotFile;
      let documentBuffer: Buffer | null = null;

      if (source.documentUrl) {
        if (offline) {
          documentBuffer = await readFile(
            path.resolve(process.cwd(), snapshotFile),
          );
          contentHash = createHash("sha256")
            .update(documentBuffer)
            .digest("hex");
        } else {
          const fetched = await fetchBytes(source.documentUrl);
          httpStatus = fetched.status;
          documentBuffer = fetched.buffer;
          contentHash = createHash("sha256")
            .update(documentBuffer)
            .digest("hex");
          if (!dryRun) {
            const absolute = path.resolve(process.cwd(), snapshotFile);
            await mkdir(path.dirname(absolute), { recursive: true });
            await writeFile(absolute, documentBuffer);
          }
        }
        html =
          source.documentType === "xlsx" || source.documentType === "xls"
            ? ""
            : await documentToText(documentBuffer);
      } else if (offline) {
        html = await readFile(
          path.resolve(process.cwd(), source.snapshotFile),
          "utf8",
        );
        contentHash = createHash("sha256").update(html).digest("hex");
      } else {
        const fetched = await fetchHtml(source.url);
        html = fetched.html;
        httpStatus = fetched.status;
        contentHash = createHash("sha256").update(html).digest("hex");
        if (!dryRun) {
          const snapshotPath = path.resolve(
            process.cwd(),
            source.snapshotFile,
          );
          await mkdir(path.dirname(snapshotPath), { recursive: true });
          await writeFile(snapshotPath, html, "utf8");
        }
      }

      const publishedAt = parsePublishedAt(html, source.publishedAt);
      const parsed =
        (source.documentType === "xlsx" || source.documentType === "xls") &&
        documentBuffer
          ? parseXlsxCases(documentBuffer, source.stage, source.stageLabel)
          : source.parser(html);
      const { cases, duplicates } = dedupeCases(parsed.cases);

      if (cases.length === 0) {
        throw new Error("解析结果为空");
      }

      const fetchedAt =
        (offline ? await readExistingFetchedAt(source.outputFile) : null) ??
        new Date().toISOString();

      const existingRun = offline
        ? await readExistingIngestRun(source.outputFile)
        : null;
      // 离线重跑且内容/解析器未变时复用原运行记录，保证生成文件幂等。
      // 在线重新抓取始终创建新运行，形成可追溯的核验历史。
      const ingestRun: IngestRunMeta =
        existingRun &&
        existingRun.parserVersion === PARSER_VERSION &&
        existingRun.contentHash === contentHash
          ? existingRun
          : {
              id: randomUUID(),
              sourceKey: source.key,
              sourceUrl: source.url,
              parserVersion: PARSER_VERSION,
              status: parsed.warnings.length > 0 ? "partial" : "success",
              startedAt,
              finishedAt: new Date().toISOString(),
              httpStatus,
              contentHash,
              snapshotPath: snapshotFile,
              warnings: parsed.warnings.length,
              errors: 0,
              actor: "scripts/ingest-announcements.ts",
            };

      let written = false;
      if (!dryRun) {
        written = await writeJsonIfChanged(
          source.outputFile,
          buildOutput(source, publishedAt, fetchedAt, cases, ingestRun),
        );
      }

      results.push({
        key: source.key,
        ok: true,
        cases: cases.length,
        duplicates,
        warnings: parsed.warnings.length,
        written,
        ingestRunId: ingestRun.id,
        ...(verbose
          ? {
              names: cases.map((item) => item.name),
              warningDetails: parsed.warnings,
            }
          : {}),
      });
    } catch (error) {
      results.push({
        key: source.key,
        ok: false,
        cases: 0,
        duplicates: 0,
        warnings: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        dryRun,
        offline,
        results,
        failed: results.filter((item) => !item.ok).length,
      },
      null,
      2,
    )}\n`,
  );

  if (results.some((item) => !item.ok)) {
    process.exitCode = 1;
  }
}

const isMain =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
