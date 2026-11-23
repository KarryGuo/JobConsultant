import { prisma } from "../lib/db";

type RegistrySeed = {
  key: string;
  name: string;
  category: string;
  level: "A" | "B";
  region?: string;
  baseUrl?: string;
  accessType: "public_web" | "api" | "manual";
  fetchMode: "manual" | "script";
  reviewCycleDays: number;
  enabled: boolean;
  notes?: string;
};

const SOURCES: RegistrySeed[] = [
  {
    key: "shaanxi-hrss-labor-violation",
    name: "陕西省人社厅重大劳动保障违法行为社会公布",
    category: "labor_violation",
    level: "A",
    region: "陕西省",
    baseUrl: "https://rst.shaanxi.gov.cn/",
    accessType: "public_web",
    fetchMode: "manual",
    reviewCycleDays: 30,
    enabled: true,
    notes: "当前唯一已采集来源；同一公告可覆盖多家企业。",
  },
  {
    key: "henan-hrss-labor-violation",
    name: "河南省人社厅拖欠农民工工资失信联合惩戒对象名单公告",
    category: "labor_violation",
    level: "A",
    region: "河南省",
    baseUrl: "https://hrss.henan.gov.cn/",
    accessType: "public_web",
    fetchMode: "script",
    reviewCycleDays: 30,
    enabled: true,
    notes:
      "官方主动公开公告；脚本抓取公告页并保存快照，不绕过登录/验证码。",
  },
  {
    key: "anhui-hrss-labor-violation",
    name: "安徽省人社厅重大劳动保障违法典型案件与失信联合惩戒名单公告",
    category: "labor_violation",
    level: "A",
    region: "安徽省",
    baseUrl: "https://hrss.ah.gov.cn/",
    accessType: "public_web",
    fetchMode: "script",
    reviewCycleDays: 30,
    enabled: true,
    notes:
      "官方主动公开公告；脚本抓取公告页并保存快照，不绕过登录/验证码。",
  },
  {
    key: "hubei-hrss-labor-violation",
    name: "湖北省人社厅重大劳动保障违法行为案件公布",
    category: "labor_violation",
    level: "A",
    region: "湖北省",
    baseUrl: "https://rst.hubei.gov.cn/",
    accessType: "public_web",
    fetchMode: "script",
    reviewCycleDays: 30,
    enabled: true,
    notes:
      "官方主动公开公告；脚本抓取公告页并保存快照，不绕过登录/验证码。",
  },
  {
    key: "fujian-hrss-labor-violation",
    name: "福建省人社厅重大劳动保障违法行为公布",
    category: "labor_violation",
    level: "A",
    region: "福建省",
    baseUrl: "https://rst.fj.gov.cn/",
    accessType: "public_web",
    fetchMode: "script",
    reviewCycleDays: 30,
    enabled: true,
    notes:
      "官方主动公开公告；脚本抓取公告页并保存快照，不绕过登录/验证码。",
  },
  {
    key: "creditchina-credit-penalty",
    name: "信用中国行政处罚公示",
    category: "credit_penalty",
    level: "A",
    region: "全国",
    baseUrl: "https://www.creditchina.gov.cn/",
    accessType: "manual",
    fetchMode: "manual",
    reviewCycleDays: 30,
    enabled: false,
    notes: "规划中。需按公开查询规则人工核验，不绕过验证码。",
  },
  {
    key: "court-exec",
    name: "中国执行信息公开网",
    category: "court_exec",
    level: "A",
    region: "全国",
    baseUrl: "http://zxgk.court.gov.cn/",
    accessType: "manual",
    fetchMode: "manual",
    reviewCycleDays: 30,
    enabled: false,
    notes: "规划中。被执行记录需要人工核验并保存快照。",
  },
  {
    key: "court-bankruptcy",
    name: "全国企业破产重整案件信息网",
    category: "bankruptcy",
    level: "A",
    region: "全国",
    baseUrl: "https://pccz.court.gov.cn/",
    accessType: "manual",
    fetchMode: "manual",
    reviewCycleDays: 30,
    enabled: false,
    notes: "规划中。覆盖破产重整、破产清算等公开公告。",
  },
  {
    key: "tax-arrears",
    name: "国家税务总局重大税收违法失信主体信息公布",
    category: "tax_arrears",
    level: "A",
    region: "全国",
    baseUrl: "https://www.chinatax.gov.cn/",
    accessType: "manual",
    fetchMode: "manual",
    reviewCycleDays: 30,
    enabled: false,
    notes: "规划中。欠税公告需要按地区分批采集。",
  },
  {
    key: "gsxt-operating-anomaly",
    name: "国家企业信用信息公示系统经营异常名录",
    category: "operating_anomaly",
    level: "A",
    region: "全国",
    baseUrl: "https://www.gsxt.gov.cn/",
    accessType: "manual",
    fetchMode: "manual",
    reviewCycleDays: 30,
    enabled: false,
    notes: "规划中。系统需要登录/验证码，当前仅作为人工核验入口。",
  },
];

async function main() {
  for (const source of SOURCES) {
    await prisma.sourceRegistry.upsert({
      where: { key: source.key },
      update: {
        name: source.name,
        category: source.category,
        level: source.level,
        region: source.region ?? null,
        baseUrl: source.baseUrl ?? null,
        accessType: source.accessType,
        fetchMode: source.fetchMode,
        reviewCycleDays: source.reviewCycleDays,
        enabled: source.enabled,
        notes: source.notes ?? null,
      },
      create: {
        key: source.key,
        name: source.name,
        category: source.category,
        level: source.level,
        region: source.region ?? null,
        baseUrl: source.baseUrl ?? null,
        accessType: source.accessType,
        fetchMode: source.fetchMode,
        reviewCycleDays: source.reviewCycleDays,
        enabled: source.enabled,
        notes: source.notes ?? null,
      },
    });
  }

  const total = await prisma.sourceRegistry.count();
  const enabled = await prisma.sourceRegistry.count({
    where: { enabled: true },
  });
  process.stdout.write(
    `source registry: ${total} entries, ${enabled} enabled\n`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
