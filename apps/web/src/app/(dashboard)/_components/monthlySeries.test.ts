import { describe, expect, it } from 'vitest';
import { bucketByMonth, monthRange, pktYearMonth, yearMonthRanges } from './monthlySeries';

describe('monthRange', () => {
  it('covers November 2026 in PKT (starts 19:00 UTC on 31 Oct)', () => {
    expect(monthRange(2026, 10)).toEqual({
      from: '2026-10-31T19:00:00.000Z',
      to: '2026-11-30T19:00:00.000Z',
    });
  });

  it('handles February in a non-leap year', () => {
    expect(monthRange(2026, 1)).toEqual({
      from: '2026-01-31T19:00:00.000Z',
      to: '2026-02-28T19:00:00.000Z',
    });
  });

  it('handles February in a leap year (29 days)', () => {
    expect(monthRange(2024, 1)).toEqual({
      from: '2024-01-31T19:00:00.000Z',
      to: '2024-02-29T19:00:00.000Z',
    });
  });

  it('rolls December over into January of the next year', () => {
    expect(monthRange(2026, 11)).toEqual({
      from: '2026-11-30T19:00:00.000Z',
      to: '2026-12-31T19:00:00.000Z',
    });
  });

  it('returns 12 ranges starting in January', () => {
    const ranges = yearMonthRanges(2026);
    expect(ranges).toHaveLength(12);
    expect(ranges[0]).toEqual({
      from: '2025-12-31T19:00:00.000Z',
      to: '2026-01-31T19:00:00.000Z',
    });
    expect(ranges[11]).toEqual({
      from: '2026-11-30T19:00:00.000Z',
      to: '2026-12-31T19:00:00.000Z',
    });
  });
});

describe('pktYearMonth', () => {
  it('reads 23:59 PKT on 31 Dec as December of the old year', () => {
    expect(pktYearMonth(new Date('2025-12-31T18:59:59.000Z'))).toEqual({
      year: 2025,
      monthIndex: 11,
    });
  });

  it('reads 00:00 PKT on 1 Jan as January of the new year', () => {
    expect(pktYearMonth(new Date('2025-12-31T19:00:00.000Z'))).toEqual({
      year: 2026,
      monthIndex: 0,
    });
  });
});

describe('bucketByMonth', () => {
  it('counts ISO dates into their PKT month and ignores other years', () => {
    expect(
      bucketByMonth(
        [
          '2026-11-03T10:20:00.000Z',
          '2026-11-07T09:00:00.000Z',
          '2026-01-15T00:00:00.000Z',
          '2025-11-03T10:20:00.000Z',
          'not-a-date',
        ],
        2026,
      ),
    ).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 0]);
  });

  it('buckets 00:00–04:59 PKT into the PKT month, not the UTC month', () => {
    expect(
      bucketByMonth(
        [
          '2026-10-31T19:30:00.000Z', // 1 Nov 00:30 PKT -> November
          '2026-11-30T18:30:00.000Z', // 30 Nov 23:30 PKT -> November
          '2026-11-30T19:30:00.000Z', // 1 Dec 00:30 PKT -> December
          '2026-01-31T19:00:00.000Z', // 1 Feb 00:00 PKT -> February
          '2025-12-31T19:00:00.000Z', // 1 Jan 00:00 PKT -> January
        ],
        2026,
      ),
    ).toEqual([1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 2, 1]);
  });

  it('ignores dates outside the year on both ends', () => {
    expect(
      bucketByMonth(
        [
          '2025-12-31T18:59:59.000Z', // 31 Dec 23:59 PKT 2025
          '2026-12-31T19:00:00.000Z', // 1 Jan 00:00 PKT 2027
          '2027-06-15T12:00:00.000Z',
        ],
        2026,
      ),
    ).toEqual(Array.from({ length: 12 }, () => 0));
  });

  it('returns all zeros when there is no data', () => {
    expect(bucketByMonth([], 2026)).toEqual(Array.from({ length: 12 }, () => 0));
  });
});
