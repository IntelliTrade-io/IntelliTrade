type RateLimitConfig = {
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

type RateBucket = {
  count: number;
  resetAt: number;
};

export function createInMemoryRateLimiter(config: RateLimitConfig) {
  const buckets = new Map<string, RateBucket>();

  return (key: string, now = Date.now()): RateLimitResult => {
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, {
        count: 1,
        resetAt: now + config.windowMs
      });
      pruneBuckets(buckets, now);

      return {
        allowed: true,
        remaining: config.limit - 1,
        retryAfterSeconds: Math.ceil(config.windowMs / 1000)
      };
    }

    if (current.count >= config.limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((current.resetAt - now) / 1000)
        )
      };
    }

    current.count += 1;
    buckets.set(key, current);

    return {
      allowed: true,
      remaining: Math.max(0, config.limit - current.count),
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000))
    };
  };
}

function pruneBuckets(buckets: Map<string, RateBucket>, now: number) {
  for (const [key, value] of buckets.entries()) {
    if (value.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export const checkConflictsRateLimit = createInMemoryRateLimiter({
  limit: 30,
  windowMs: 5 * 60 * 1000
});
