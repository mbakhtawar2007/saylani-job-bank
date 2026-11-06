import { getRedis } from '@/lib/redis/client';
import { logger } from '@/lib/logger';
import { RateLimitedError } from '../errors';

export interface RateLimitRule {
  /** Max requests per window. */
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

const PREFIX = process.env.RATE_LIMIT_PREFIX ?? 'rl';

// Fallback when Redis is not configured or unreachable: per-process fixed windows.
const memory = new Map<string, { count: number; resetAt: number }>();

function consumeMemory(key: string, rule: RateLimitRule): RateLimitResult {
  const now = Date.now();
  let entry = memory.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + rule.windowSeconds * 1000 };
    memory.set(key, entry);
  }
  entry.count += 1;
  if (memory.size > 50_000) {
    for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k);
  }
  return {
    allowed: entry.count <= rule.limit,
    remaining: Math.max(0, rule.limit - entry.count),
    retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
  };
}

/**
 * Fixed-window counter. Redis (shared across instances) when available; otherwise an
 * in-process map — degraded but never "no limit at all".
 */
export async function consumeRateLimit(
  name: string,
  subject: string,
  rule: RateLimitRule,
): Promise<RateLimitResult> {
  const key = `${PREFIX}:${name}:${subject}`;
  const redis = getRedis();
  if (redis) {
    try {
      const results = await redis
        .multi()
        .incr(key)
        .expire(key, rule.windowSeconds, 'NX')
        .ttl(key)
        .exec();
      const count = Number(results?.[0]?.[1] ?? 0);
      const ttl = Number(results?.[2]?.[1] ?? rule.windowSeconds);
      return {
        allowed: count <= rule.limit,
        remaining: Math.max(0, rule.limit - count),
        retryAfterSeconds: Math.max(1, ttl),
      };
    } catch (err) {
      logger.warn('rate limiter falling back to memory', { name, err });
    }
  }
  return consumeMemory(key, rule);
}

/** Throws RateLimitedError (429 + Retry-After) when the limit is exceeded. */
export async function enforceRateLimit(
  name: string,
  subject: string,
  rule: RateLimitRule,
  message?: string,
): Promise<void> {
  const result = await consumeRateLimit(name, subject, rule);
  if (!result.allowed) throw new RateLimitedError(result.retryAfterSeconds, message);
}

/**
 * IP-bucketed rate limiting that fails CLOSED: when no trustworthy IP could be
 * determined (see lib/http/client-ip.ts — no proxy in front, or the X-Forwarded-For
 * chain is shorter than TRUSTED_PROXY_HOPS), the request must not silently escape
 * limiting the way the old `if (ctx.ip) await enforceRateLimit(...)` pattern did.
 * Denying outright would break direct local connections (dev has no proxy), so all
 * such requests share one strict bucket ('untrusted') under the same rule instead
 * of getting a free pass. In production the app always sits behind its proxies, so
 * the shared bucket is only reached by requests that bypassed them.
 *
 * NOTE: domains/auth/service.ts still has its own local rateLimitByIp that skips
 * when ctx.ip is null. Switch it to this helper to close the auth endpoints too.
 */
export async function enforceRateLimitByIp(
  ip: string | null,
  name: string,
  rule: RateLimitRule,
  message?: string,
): Promise<void> {
  await enforceRateLimit(name, ip ?? 'untrusted', rule, message);
}

/** Test helper. */
export function resetMemoryRateLimits(): void {
  memory.clear();
}
