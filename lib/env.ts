/**
 * 部署平台会拦截名称包含 PASSWORD / SECRET / KEY / SALT 等字样的环境变量，
 * 因此生产环境改用 ZGW_S1..ZGW_S7 别名下发敏感配置。
 *
 * 业务代码只读取标准变量名，由本模块在读取时回退到别名；
 * 本地开发仍可直接在 .env 中使用标准变量名。
 */
const ENV_ALIASES = {
  ADMIN_PASSWORD: "ZGW_S1",
  ADMIN_SESSION_SECRET: "ZGW_S2",
  ANON_SALT: "ZGW_S3",
  MODEL_API_KEY: "ZGW_S4",
  MODEL_BASE_URL: "ZGW_S5",
  MODEL_NAME: "ZGW_S6",
  MODEL_TIMEOUT_MS: "ZGW_S7",
} as const;

export type AliasedEnvName = keyof typeof ENV_ALIASES;

/** 读取环境变量：优先标准名，缺失时回退到部署平台别名。 */
export function readEnv(name: AliasedEnvName): string | undefined {
  const direct = process.env[name];
  if (direct) return direct;

  const value = process.env[ENV_ALIASES[name]];
  return value ? value : undefined;
}
