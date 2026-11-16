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
 * 取客户端标识。只有部署在可信反向代理之后时 x-forwarded-for 才可信；
 * 直接暴露时该头可以被伪造，应改为在边缘层限流。
 */
export function clientKey(request: {
  headers: { get: (name: string) => string | null };
}): string {
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  if (forwarded) return forwarded;

  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp || "local";
}

export function retryAfterSeconds(result: RateLimitResult): string {
  return String(Math.max(1, Math.ceil(result.retryAfterMs / 1000)));
}
