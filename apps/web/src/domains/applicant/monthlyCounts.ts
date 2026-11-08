import 'server-only';
import { schema } from '@jobbank/db';
import { and, count, eq, exists, gte, inArray, lt, sql, type SQL } from 'drizzle-orm';
import { assertPermission, isSuperAdmin, type Actor } from '@/domains/shared/scope';
import { db } from '@/lib/db';
import { a, addr } from './repository';

/**
 * Monthly applicant registrations, Jan..Dec of `year`, in ONE grouped query
 * — the replacement for twelve `listApplicants` calls (each of which ran a
 * row fetch, a COUNT, and a full master-data label load just to read
 * `meta.total`). Months with no registrations are 0.
 *
 * Bucketing and the year window are in Asia/Karachi (PKT, UTC+5, no DST):
 * a registration at 00:00–04:59 PKT on the 1st counts in that month, not
 * the previous one. Scoping matches `listApplicants` exactly — Super Admin
 * is platform-wide, everyone else is city-scoped to their branches.
 */
export async function monthlyApplicantCounts(actor: Actor, year: number): Promise<number[]> {
  assertPermission(actor, 'applicant:read');
  // PKT year window as UTC instants: 1 Jan 00:00 PKT = 31 Dec 19:00 UTC.
  const start = new Date(Date.UTC(year, 0, 1) - 5 * 60 * 60 * 1000);
  const end = new Date(Date.UTC(year + 1, 0, 1) - 5 * 60 * 60 * 1000);

  // Same city scoping as listApplicants (applicant/staff.ts).
  const cityScope: SQL | undefined = isSuperAdmin(actor)
    ? undefined
    : actor.branchIds.length === 0
      ? sql`false`
      : exists(
          db
            .select({ one: sql`1` })
            .from(schema.branches)
            .where(
              and(
                inArray(schema.branches.id, actor.branchIds),
                sql`upper(${schema.branches.city}) = upper(${addr.cityCode})`,
              ),
            ),
        );

  const monthExpr = sql<number>`extract(month from ${a.createdAt} at time zone 'Asia/Karachi')`;
  const rows = await db
    .select({ month: monthExpr, value: count() })
    .from(a)
    .leftJoin(addr, eq(addr.applicantId, a.id))
    .where(and(cityScope, gte(a.createdAt, start), lt(a.createdAt, end)))
    .groupBy(monthExpr);

  const values = Array.from({ length: 12 }, () => 0);
  for (const row of rows) {
    if (row.month >= 1 && row.month <= 12) values[row.month - 1] = row.value;
  }
  return values;
}
