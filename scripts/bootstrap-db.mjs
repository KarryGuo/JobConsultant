/**
 * 确保本地数据库存在。便携版 PostgreSQL 重新 initdb 后只有默认库，
 * 本脚本按 DATABASE_URL 中的库名补建，幂等可重复执行。
 */
import { PrismaClient } from "@prisma/client";

const targetUrl = process.env.DATABASE_URL;
if (!targetUrl) {
  console.error("DATABASE_URL 未配置");
  process.exit(1);
}

const dbName = targetUrl.split("/").pop()?.split("?")[0];
if (!dbName || !/^[a-z0-9_]+$/.test(dbName)) {
  console.error(`无法从 DATABASE_URL 解析出合法库名：${dbName}`);
  process.exit(1);
}

// 连接到维护库 postgres 来检查/创建目标库，避免目标库不存在时直接失败。
const adminUrl = targetUrl.replace(/\/[^/?]+(\?|$)/, "/postgres$1");

const admin = new PrismaClient({ datasourceUrl: adminUrl });

try {
  const rows = await admin.$queryRawUnsafe(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    dbName,
  );

  if (rows.length > 0) {
    console.log(`数据库 ${dbName} 已存在`);
  } else {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
    console.log(`已创建数据库 ${dbName}`);
  }
} finally {
  await admin.$disconnect();
}
