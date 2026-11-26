import { isIP } from "node:net";

type Bucket = {
  count: number;
  resetAt: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

export type RateLimiter = {
  check: (key: string, now?: number) => RateLimitResult;
};

const MAX_BUCKETS = 5000;

function prune(buckets: Map<string, Bucket>, now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }

  // 极端情况下仍然过多时，按插入顺序淘汰最早的一批，避免内存无界增长。
  if (buckets.size > MAX_BUCKETS) {
    const overflow = buckets.size - MAX_BUCKETS;
    let removed = 0;
    for (const key of buckets.keys()) {
      if (removed >= overflow) break;
      buckets.delete(key);
      removed += 1;
    }
  }
}

/**
 * 进程内固定窗口限流。适合当前单实例部署；
 * 多实例或需要跨重启保持时，应替换为共享存储（如 Redis）。
 */
export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
}): RateLimiter {
  const { limit, windowMs } = options;
  const buckets = new Map<string, Bucket>();

  return {
    check(key, now = Date.now()) {
      const current = buckets.get(key);

      if (!current || current.resetAt <= now) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        if (buckets.size > MAX_BUCKETS) prune(buckets, now);
        return {
          allowed: true,
          remaining: limit - 1,
          retryAfterMs: windowMs,
        };
      }

      if (current.count >= limit) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterMs: Math.max(0, current.resetAt - now),
        };
      }

      current.count += 1;
      return {
        allowed: true,
        remaining: limit - current.count,
        retryAfterMs: Math.max(0, current.resetAt - now),
      };
    },
  };
}

/**
 * 取客户端标识。
 *
 * 实测平台请求头结构（2026-11-26）：
 *   x-real-ip: 116.162.51.69            ← 平台固定注入的代理出口 IP
 *   x-forwarded-for: <客户端值...>, 116.128.241.221, 116.162.51.69,10.96.12.117
 * 即平台在客户端值后面追加「真实客户端 IP、代理 IP、内网 IP」三段。
 * 客户端自己传的 x-real-ip 会被丢弃，XFF 左侧则是可伪造的。
 *
 * 因此不能用 XFF 第一段；从右往左取第一个公网且不等于 x-real-ip 的跳，
 * 才能拿到真实客户端 IP，同时避免把共享代理出口当成所有用户。
 */
export function clientKey(request: {
  headers: { get: (name: string) => string | null };
}): string {
  const realIp = normalizeIp(request.headers.get("x-real-ip"));
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const publicHops = forwarded
    .split(",")
    .map((hop) => normalizeIp(hop))
    .filter((hop): hop is string => Boolean(hop) && !isPrivateIp(hop as string));

  // 平台代理出口：优先按 x-real-ip 定位，找不到时取最后一个公网跳。
  let proxyIndex = -1;
  if (realIp && !isPrivateIp(realIp)) {
    for (let index = publicHops.length - 1; index >= 0; index -= 1) {
      if (publicHops[index] === realIp) {
        proxyIndex = index;
        break;
      }
    }
  }
  if (proxyIndex < 0) proxyIndex = publicHops.length - 1;

  // 代理跳左边的一跳才是平台追加的真实客户端 IP。
  if (proxyIndex > 0) return publicHops[proxyIndex - 1];
  if (proxyIndex === 0) return publicHops[0];

  return realIp ?? "unknown";
}

/** 去掉 IPv6 方括号、zone 与 IPv4 映射前缀，非法值返回 null。 */
function normalizeIp(raw: string | null): string | null {
  if (!raw) return null;
  let value = raw.trim();
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    if (end > 0) value = value.slice(1, end);
  }
  const zone = value.indexOf("%");
  if (zone > 0) value = value.slice(0, zone);
  if (value.toLowerCase().startsWith("::ffff:")) value = value.slice(7);
  return isIP(value) ? value : null;
}

/** 内网、回环、链路本地与 CGNAT 地址不能代表真实客户端。 */
function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }

  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  return (
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe80")
  );
}

export function retryAfterSeconds(result: RateLimitResult): string {
  return String(Math.max(1, Math.ceil(result.retryAfterMs / 1000)));
}
