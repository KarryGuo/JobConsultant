import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";

export const ADMIN_COOKIE = "zgw_admin";
export const ADMIN_SESSION_MAX_AGE = 60 * 60 * 12;

/** 处理人姓名允许的字符：中英文、数字、空格与常见分隔符。 */
export const ADMIN_ACTOR_PATTERN = /^[\u4e00-\u9fa5A-Za-z0-9·._\- ]{1,20}$/;

export type AdminSession = {
  actor: string;
  nonce: string;
};

export type AdminSessionToken = {
  token: string;
  nonce: string;
  actor: string;
  issuedAt: number;
  expiresAt: Date;
};

function sessionSecret(): string {
  return process.env.ADMIN_SESSION_SECRET ?? process.env.ANON_SALT ?? "";
}

export function adminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD && sessionSecret());
}

/**
 * 密码指纹参与签名。修改 ADMIN_PASSWORD 后，
 * 所有旧会话的指纹失配，立即失效，无需等待过期。
 */
function passwordFingerprint(): string {
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!password) return "";
  return createHash("sha256").update(password).digest("hex").slice(0, 16);
}

function encodeActor(actor: string): string {
  return Buffer.from(actor, "utf8").toString("base64url");
}

/**
 * 会话内容：签发时间 + 随机串 + 处理人 + 密码指纹。
 * nonce 需要同时写入数据库，verify 之后还会做一次吊销检查。
 */
export function createAdminSession(
  actor: string,
  now = Date.now(),
): AdminSessionToken {
  const nonce = randomBytes(12).toString("hex");
  const fingerprint = passwordFingerprint();
  const payload = `${now}.${nonce}.${encodeActor(actor)}.${fingerprint}`;
  const signature = createHmac("sha256", sessionSecret())
    .update(payload)
    .digest("hex");

  return {
    token: `${payload}.${signature}`,
    nonce,
    actor,
    issuedAt: now,
    expiresAt: new Date(now + ADMIN_SESSION_MAX_AGE * 1000),
  };
}

/**
 * 只校验签名、格式、有效期和密码指纹，不查数据库。
 * 需要确认会话未被吊销时使用 readAdminSession。
 */
export function verifyAdminSession(
  value: string,
  now = Date.now(),
): (AdminSession & { issuedAt: number; expiresAt: Date }) | null {
  const secret = sessionSecret();
  const fingerprint = passwordFingerprint();
  if (!secret || !fingerprint) return null;

  const parts = value.split(".");
  if (parts.length !== 5) return null;

  const [timestamp, nonce, actorToken, tokenFingerprint, signature] = parts;
  if (!timestamp || !nonce || !actorToken || !tokenFingerprint || !signature) {
    return null;
  }

  // 固定格式，避免 Buffer.from(hex) 忽略奇数长度末尾字符造成签名可延展。
  if (!/^\d{10,16}$/.test(timestamp)) return null;
  if (!/^[a-f0-9]{24}$/.test(nonce)) return null;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(actorToken)) return null;
  if (!/^[a-f0-9]{16}$/.test(tokenFingerprint)) return null;
  if (!/^[a-f0-9]{64}$/.test(signature)) return null;

  const payload = `${timestamp}.${nonce}.${actorToken}.${tokenFingerprint}`;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const actualBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  if (actualBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  // 密码已修改：旧会话全部作废。
  if (tokenFingerprint !== fingerprint) return null;

  const issuedAt = Number(timestamp);
  if (!Number.isFinite(issuedAt)) return null;

  const expiresAt = issuedAt + ADMIN_SESSION_MAX_AGE * 1000;
  if (issuedAt > now + 60_000 || now >= expiresAt) return null;

  let actor: string;
  try {
    actor = Buffer.from(actorToken, "base64url").toString("utf8").trim();
  } catch {
    return null;
  }

  if (!ADMIN_ACTOR_PATTERN.test(actor)) return null;

  return { actor, nonce, issuedAt, expiresAt: new Date(expiresAt) };
}

/**
 * 校验签名后再查数据库，确认会话未被退出/吊销。
 */
export async function readAdminSession(
  value: string,
  now = Date.now(),
): Promise<AdminSession | null> {
  const parsed = verifyAdminSession(value, now);
  if (!parsed) return null;

  const record = await prisma.adminSession.findUnique({
    where: { nonce: parsed.nonce },
    select: { actor: true, revokedAt: true, expiresAt: true },
  });

  if (
    !record ||
    record.revokedAt !== null ||
    record.expiresAt.getTime() <= now
  ) {
    return null;
  }

  return { actor: record.actor, nonce: parsed.nonce };
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  const value = store.get(ADMIN_COOKIE)?.value;
  return value ? readAdminSession(value) : null;
}

export async function isAdmin(): Promise<boolean> {
  return (await getAdminSession()) !== null;
}

export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login");
}

/** 退出登录：把当前 nonce 标记为已吊销，服务端立即拒绝该 Cookie。 */
export async function revokeAdminSession(value: string): Promise<void> {
  const parsed = verifyAdminSession(value);
  if (!parsed) return;

  await prisma.adminSession.updateMany({
    where: { nonce: parsed.nonce, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** 清理已过期会话，避免表随时间无限增长。 */
export async function cleanupExpiredAdminSessions(
  now = new Date(),
): Promise<void> {
  await prisma.adminSession.deleteMany({
    where: { expiresAt: { lt: now } },
  });
}
