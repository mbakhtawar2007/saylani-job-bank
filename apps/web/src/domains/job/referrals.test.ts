import { describe, expect, it } from 'vitest';
import { pktYearMonth } from './referrals';

// M1 — hire months are bucketed in Asia/Karachi, not UTC. The risky window
// is 00:00–04:59 PKT, which is still the previous UTC day.
describe('pktYearMonth', () => {
  it('a 01:00 PKT hire on 1 Jan belongs to January, not December', () => {
    // 2025-12-31 20:00 UTC = 2026-01-01 01:00 PKT.
    expect(pktYearMonth(new Date('2025-12-31T20:00:00.000Z'))).toEqual({ year: 2026, month: 1 });
  });

  it('a 23:00 PKT hire on 31 Dec stays in December', () => {
    // 2025-12-31 18:00 UTC = 2025-12-31 23:00 PKT.
    expect(pktYearMonth(new Date('2025-12-31T18:00:00.000Z'))).toEqual({
      year: 2025,
      month: 12,
    });
  });

  it('a 00:30 PKT hire on 1 Feb belongs to February', () => {
    // 2026-01-31 19:30 UTC = 2026-02-01 00:30 PKT.
    expect(pktYearMonth(new Date('2026-01-31T19:30:00.000Z'))).toEqual({ year: 2026, month: 2 });
  });

  it('a midday hire is unaffected', () => {
    expect(pktYearMonth(new Date('2026-06-15T07:00:00.000Z'))).toEqual({
      year: 2026,
      month: 6,
    });
  });
});
