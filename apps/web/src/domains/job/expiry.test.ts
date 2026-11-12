import { describe, expect, it } from 'vitest';
import { msUntilNextExpiryRun } from './expiry';

describe('msUntilNextExpiryRun', () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  it('before 19:05 UTC runs later the same day', () => {
    const now = new Date('2026-11-12T10:00:00.000Z');
    expect(msUntilNextExpiryRun(now)).toBe(9 * 60 * 60 * 1000 + 5 * 60 * 1000);
  });

  it('just before 19:05 UTC runs minutes later the same day', () => {
    const now = new Date('2026-11-12T19:04:00.000Z');
    expect(msUntilNextExpiryRun(now)).toBe(60 * 1000);
  });

  it('after 19:05 UTC runs the next day', () => {
    const now = new Date('2026-11-12T20:00:00.000Z');
    expect(msUntilNextExpiryRun(now)).toBe(23 * 60 * 60 * 1000 + 5 * 60 * 1000);
  });

  it('exactly at 19:05 UTC waits until tomorrow (no 0ms double-fire)', () => {
    const now = new Date('2026-11-12T19:05:00.000Z');
    expect(msUntilNextExpiryRun(now)).toBe(DAY_MS);
  });

  it('just after midnight runs that evening', () => {
    const now = new Date('2026-11-12T00:05:00.000Z');
    expect(msUntilNextExpiryRun(now)).toBe(19 * 60 * 60 * 1000);
  });
});
