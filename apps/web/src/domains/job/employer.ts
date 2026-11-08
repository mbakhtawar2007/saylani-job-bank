import 'server-only';
import { schema } from '@jobbank/db';
import type { PaginationMeta } from '@jobbank/shared';
import { and, count, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import { assertPermission, type Actor } from '@/domains/shared/scope';
import { paginationMeta, type ListQuery } from '@/domains/shared/pagination';
import { NotFoundError } from '@/domains/shared/errors';
import { db } from '@/lib/db';
import { buildJobView, j, loadJob, type JobView } from './repository';

const ap = schema.applications;
const jm = schema.jobMatches;
const mr = schema.matchRuns;

// ─── Employer: their own postings only ────────────────────────────────
// Job → employer referrals were removed end-to-end (Referral-Based
// Recruitment Workflow §4 item 5): employers see ONLY jobs their own
// company posted. There is no referred half any more — no dedup, no
// 'REFERRED' source, no referral stats.

/**
 * The employer's Jobs list: their own company's postings only, newest
 * first.
 *
 * M32 — pagination: pass a ListQuery (parsed with parseListQuery, pageSize
 * capped at 100 by the helper) to get one page plus pagination metadata.
 * Without a query the full list is returned, as before — the dashboard
 * still calls it that way.
 */
export async function listJobsForEmployer(actor: Actor): Promise<JobView[]>;
export async function listJobsForEmployer(
  actor: Actor,
  query: Pick<
    ListQuery<'createdAt', Record<string, never>>,
    'page' | 'pageSize' | 'offset' | 'limit'
  >,
): Promise<{ items: JobView[]; pagination: PaginationMeta }>;
export async function listJobsForEmployer(
  actor: Actor,
  query?: Pick<
    ListQuery<'createdAt', Record<string, never>>,
    'page' | 'pageSize' | 'offset' | 'limit'
  >,
): Promise<JobView[] | { items: JobView[]; pagination: PaginationMeta }> {
  assertPermission(actor, 'job:read');
  if (!actor.companyId) return query ? { items: [], pagination: paginationMeta(query, 0) } : [];

  // Cheap id-only pass first: buildJobView runs 3 queries per job, so it
  // only ever runs for the page being returned.
  const ownIds = await db
    .select({ id: j.id, createdAt: j.createdAt })
    .from(j)
    .where(eq(j.companyId, actor.companyId));
  ownIds.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const page = query ? ownIds.slice(query.offset, query.offset + query.limit) : ownIds;
  const rows =
    page.length === 0
      ? []
      : await db
          .select()
          .from(j)
          .where(
            inArray(
              j.id,
              page.map((d) => d.id),
            ),
          );
  const byId = new Map(rows.map((row) => [row.id, row]));
  const items: JobView[] = (
    await Promise.all(
      page.map(async (d) => {
        const row = byId.get(d.id);
        if (!row) return null;
        return buildJobView(db, row);
      }),
    )
  ).filter((item): item is JobView => item !== null);

  if (!query) return items;
  return { items, pagination: paginationMeta(query, ownIds.length) };
}

/**
 * One job for an employer: their own posting only. Anything else is a
 * 404 — employers never see other companies' jobs.
 */
export async function getEmployerJob(actor: Actor, jobId: string): Promise<JobView> {
  assertPermission(actor, 'job:read');
  const row = await loadJob(db, jobId);
  if (!actor.companyId || row.companyId !== actor.companyId) {
    throw new NotFoundError('Job', jobId);
  }
  return buildJobView(db, row);
}

/** Does this employer have any of their own postings under Jobs? */
export async function hasVisibleEmployerJobs(actor: Actor): Promise<boolean> {
  if (!actor.companyId) return false;
  const [own] = await db.select({ value: count() }).from(j).where(eq(j.companyId, actor.companyId));
  return (own?.value ?? 0) > 0;
}

// ─── Employer: hiring counts over their own jobs ──────────────────────

/** Application statuses the employer can see for their jobs (mirrors placement/employer.ts). */
const EMPLOYER_VISIBLE_APPLICATION_STATUSES = [
  'FORWARDED',
  'EMPLOYER_INTERVIEW_SCHEDULED',
  'EMPLOYER_INTERVIEW_POSTPONED',
  'EMPLOYER_INTERVIEW_CANCELLED',
  'ON_HOLD',
  'OFFER_EXTENDED',
  'EMPLOYER_REJECTED',
  'APPLICANT_REFUSED',
  'HIRED',
] as const;

/** Count helper used by the employer dashboard pipeline (own jobs only). M2: pass the
 *  visible job ids the caller already fetched (e.g. WelcomePanel's listJobsForEmployer
 *  result) instead of re-querying them; without ids it fetches them itself. */
export async function countEmployerCandidates(
  actor: Actor,
  jobIds?: string[],
): Promise<{ referred: number; hired: number }> {
  if (!actor.companyId) return { referred: 0, hired: 0 };
  const ids = jobIds ?? (await visibleEmployerJobIds(actor));
  if (ids.length === 0) return { referred: 0, hired: 0 };
  const [candidates, hireEvents] = await Promise.all([
    db
      .select({ value: count() })
      .from(ap)
      .where(
        and(inArray(ap.jobId, ids), inArray(ap.status, [...EMPLOYER_VISIBLE_APPLICATION_STATUSES])),
      ),
    listHireEvents(ids),
  ]);
  return { referred: candidates[0]?.value ?? 0, hired: hireEvents.length };
}

/** Job ids of the employer's own postings. */
async function visibleEmployerJobIds(actor: Actor): Promise<string[]> {
  if (!actor.companyId) return [];
  const own = await db.select({ id: j.id }).from(j).where(eq(j.companyId, actor.companyId));
  return own.map((row) => row.id);
}

/** One hire, as seen by either hire writer, with the time the hire was made. */
export interface HireEvent {
  jobId: string;
  applicantId: string;
  hiredAt: Date | null;
}

const pktMonthFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Karachi',
  year: 'numeric',
  month: 'numeric',
});

/**
 * M1 — [year, month] of a timestamp in Asia/Karachi. Hires at 00:00–04:59
 * PKT belong to the PKT day/month, not the UTC one the old extracts used.
 */
export function pktYearMonth(date: Date): { year: number; month: number } {
  const parts = pktMonthFormat.formatToParts(date);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  return { year, month };
}

/**
 * C3 — every hire for these jobs, from BOTH hire writers, deduplicated by
 * (job, applicant):
 *
 * - match hires: job_matches reviewStatus HIRED, excluding offers the
 *   applicant declined (applicantResponse DECLINED). Hires the audit's way —
 *   bucketed by reviewedAt, which the codebase already treats as hire time
 *   (getMyPendingOffers).
 * - placement hires: applications status HIRED, written by acceptJobOffer
 *   (7ee4e4d) for offers that never went through a match row. Bucketed by
 *   updatedAt — there is no hired-at column on applications, and HIRED is
 *   terminal there, so updatedAt is the hire time unless a later transition
 *   moves it (see H17, parallel-owned).
 *
 * A chart over job_matches alone would miss every placement hire, and a
 * chart over applications alone would miss match hires that have no
 * application row yet — so the counts are the union, with the match
 * decision time winning when both rows exist.
 */
async function listHireEvents(jobIds: string[]): Promise<HireEvent[]> {
  if (jobIds.length === 0) return [];
  const [matches, applications] = await Promise.all([
    db
      .select({ jobId: jm.jobId, applicantId: jm.applicantId, hiredAt: jm.reviewedAt })
      .from(jm)
      .innerJoin(mr, eq(mr.id, jm.runId))
      .where(
        and(
          inArray(jm.jobId, jobIds),
          eq(jm.reviewStatus, 'HIRED'),
          or(isNull(jm.applicantResponse), ne(jm.applicantResponse, 'DECLINED')),
          eq(mr.status, 'COMPLETED'),
        ),
      ),
    db
      .select({ jobId: ap.jobId, applicantId: ap.applicantId, hiredAt: ap.updatedAt })
      .from(ap)
      .where(and(inArray(ap.jobId, jobIds), eq(ap.status, 'HIRED'))),
  ]);
  const byKey = new Map<string, HireEvent>();
  for (const row of applications) {
    byKey.set(`${row.jobId}:${row.applicantId}`, {
      jobId: row.jobId,
      applicantId: row.applicantId,
      hiredAt: row.hiredAt,
    });
  }
  for (const row of matches) {
    const key = `${row.jobId}:${row.applicantId}`;
    const existing = byKey.get(key);
    byKey.set(key, {
      jobId: row.jobId,
      applicantId: row.applicantId,
      hiredAt: row.hiredAt ?? existing?.hiredAt ?? null,
    });
  }
  return [...byKey.values()];
}

/**
 * Monthly hires for the employer's own jobs, current calendar year.
 * Bucketed by hire time in Asia/Karachi (M1); months with no hires are 0.
 * Signature unchanged, so the employer dashboard chart keeps working.
 * M2: pass pre-fetched visible job ids when the caller already has them.
 */
export async function countHiresByMonth(
  actor: Actor,
  year: number,
  jobIds?: string[],
): Promise<number[]> {
  const zeros = Array.from({ length: 12 }, () => 0);
  if (!actor.companyId) return zeros;
  const ids = jobIds ?? (await visibleEmployerJobIds(actor));
  if (ids.length === 0) return zeros;
  const hires = await listHireEvents(ids);
  for (const hire of hires) {
    if (!hire.hiredAt) continue;
    const { year: hireYear, month } = pktYearMonth(hire.hiredAt);
    if (hireYear === year && month >= 1 && month <= 12)
      zeros[month - 1] = (zeros[month - 1] ?? 0) + 1;
  }
  return zeros;
}
