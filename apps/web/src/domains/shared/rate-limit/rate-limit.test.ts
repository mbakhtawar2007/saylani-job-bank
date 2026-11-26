import { afterEach, describe, expect, it, vi } from 'vitest';
import { RateLimitedError, RateLimitUnavailableError } from '../errors';
import { consumeRateLimit, enforceRateLimit, resetMemoryRateLimits } from './index';

vi.mock('@/lib/redis/client', () => ({ getRedis: () => null }));

afterEach(() => {
  resetMemoryRateLimits();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('rate limiting (memory fallback)', () => {
  it('allows up to the limit per subject, then blocks with retry-after', async () => {
    const rule = { limit: 3, windowSeconds: 900 };
    for (let i = 0; i < 3; i += 1)
      expect((await consumeRateLimit('otp', '+923001234567', rule)).allowed).toBe(true);
    const blocked = await consumeRateLimit('otp', '+923001234567', rule);
    expect(blocked).toMatchObject({ allowed: false, remaining: 0 });
    expect(blocked.retryAfterSeconds).toBeGreaterThan(890);
    // Other subjects are independent.
    expect((await consumeRateLimit('otp', '+923331234567', rule)).allowed).toBe(true);
  });

  it('resets after the window', async () => {
    vi.useFakeTimers();
    const rule = { limit: 1, windowSeconds: 60 };
    await consumeRateLimit('login', 'a@b.pk', rule);
    expect((await consumeRateLimit('login', 'a@b.pk', rule)).allowed).toBe(false);
    vi.advanceTimersByTime(61_000);
    expect((await consumeRateLimit('login', 'a@b.pk', rule)).allowed).toBe(true);
  });

  it('enforceRateLimit throws a 429 error', async () => {
    const rule = { limit: 1, windowSeconds: 60 };
    await enforceRateLimit('x', 'y', rule);
    await expect(enforceRateLimit('x', 'y', rule)).rejects.toBeInstanceOf(RateLimitedError);
  });

  it('fails closed in production when shared rate limiting is unavailable', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    await expect(
      consumeRateLimit('otp', '+923001234567', { limit: 3, windowSeconds: 60 }),
    ).rejects.toBeInstanceOf(RateLimitUnavailableError);
  });
});
