/**
 * Pure helpers for the dashboard bar charts. Every chart shows the current
 * calendar year, Jan..Dec, in Asia/Karachi (PKT, UTC+5, no daylight saving)
 * calendar months — the same PKT convention the grouped month-count queries
 * use. Nothing here invents a value: a month with no rows is 0, and the
 * chart component already renders future months empty.
 *
 * PKT is a fixed UTC+5 offset, so shifting an instant by +5h and reading its
 * UTC parts gives its PKT calendar parts exactly.
 */

/** Fixed PKT offset from UTC, in milliseconds. */
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

/** The PKT calendar year/month of an instant (monthIndex 0 = January). */
export function pktYearMonth(at: Date = new Date()): { year: number; monthIndex: number } {
  const pkt = new Date(at.getTime() + PKT_OFFSET_MS);
  return { year: pkt.getUTCFullYear(), monthIndex: pkt.getUTCMonth() };
}

/**
 * PKT month boundaries as ISO timestamps: `from` is the first instant of the
 * month in PKT, `to` is the first instant of the next month in PKT
 * (exclusive end). A registration at 00:00–04:59 PKT on the 1st therefore
 * lands in this month, not the previous one — a plain UTC-midnight boundary
 * would put it in the previous month.
 */
export function monthRange(year: number, monthIndex: number): { from: string; to: string } {
  const from = new Date(Date.UTC(year, monthIndex, 1) - PKT_OFFSET_MS);
  const to = new Date(Date.UTC(year, monthIndex + 1, 1) - PKT_OFFSET_MS);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** The 12 monthly PKT ranges for a calendar year, Jan first. */
export function yearMonthRanges(year: number): { from: string; to: string }[] {
  return Array.from({ length: 12 }, (_, m) => monthRange(year, m));
}

/**
 * Bucket ISO date-time strings into the 12 PKT months of `year`.
 * Values outside the year (or unparseable) are ignored.
 */
export function bucketByMonth(isoDates: (string | Date)[], year: number): number[] {
  const values = Array.from({ length: 12 }, () => 0);
  for (const iso of isoDates) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue;
    const { year: y, monthIndex: m } = pktYearMonth(d);
    if (y !== year) continue;
    values[m] = (values[m] ?? 0) + 1;
  }
  return values;
}
