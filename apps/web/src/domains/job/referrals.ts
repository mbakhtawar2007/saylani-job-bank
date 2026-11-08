import 'server-only';
import { schema } from '@jobbank/db';
import type { JobStatus, PaginationMeta } from '@jobbank/shared';
import { and, count, desc, eq, inArray, isNull, ne, or } from 'drizzle-orm';
import { z } from 'zod';
import { runCommand } from '@/domains/shared/audit';
import type { RequestContext } from '@/domains/shared/audit';
import { ForbiddenError, isUniqueViolation, NotFoundError } from '@/domains/shared/errors';
import {
  assertCityAccess,
  assertPermission,
  cityScope,
  hasPermission,
  type Actor,
} from '@/domains/shared/scope';
import { paginationMeta, type ListQuery } from '@/domains/shared/pagination';
import { notifyCompanyEmployers } from '@/domains/notifications';
import { db } from '@/lib/db';
import { buildJobView, j, loadJob, type JobView } from './repository';

type SignedIn = RequestContext & { actor: Actor };

const jr = schema.jobReferrals;
const co = schema.companies;
const us = schema.users;
const ap = schema.applications;
const jm = schema.jobMatches;
const mr = schema.matchRuns;

// ─── Types ────────────────────────────────────────────────────────────────

export interface JobReferralView {
  id: string;
  jobId: string;
  jobTitle: string;
  companyId: string;
  companyName: string | null;
  note: string | null;
  referredByName: string | null;
  referredAt: string;
}

/** A job as an employer sees it: their own posting, or one referred to them. */
export interface EmployerJobListItem extends JobView {
  source: 'OWN' | 'REFERRED';
  /** When staff referred this job to the employer's company (referred rows only). */
  referredAt: string | null;
  referralNote: string | null;
}

export interface ReferralTarget {
  id: string;
  name: string;
  branchId: string | null;
}

export interface EmployerReferralStats {
  /** Jobs staff have referred to this employer's company (all time). */
  totalReferred: number;
  /** Referred jobs by current job status. */
  byStatus: Record<JobStatus, number>;
  /** Referred jobs that are still open for hiring. */
  openReferred: number;
  /** Jobs referred in the last 30 days. */
  referredLast30Days: number;
  /** Candidates referred (forwarded) for the employer's referred jobs. */
  candidatesReferred: number;
  /** Hires made from the employer's referred jobs. */
  hiredFromReferred: number;
  /** Most recent referral, if any. */
  latestReferredAt: string | null;
}

// ─── Schemas ──────────────────────────────────────────────────────────────

export const referJobSchema = z.object({
  companyId: z.uuid(),
  note: z.string().trim().max(500).optional(),
});
export type ReferJobInput = z.infer<typeof referJobSchema>;

// ─── Staff: refer a job to an employer ────────────────────────────────────

/**
 * Staff shares a job with a specific employer company. Idempotent: referring
 * the same job to the same company twice returns the first referral instead
 * of a duplicate row (the unique index is the backstop, not the guard).
 */
export async function referJobToEmployer(
  ctx: SignedIn,
  jobId: string,
  input: ReferJobInput,
): Promise<JobReferralView> {
  assertPermission(ctx.actor, 'job:refer');
  const job = await loadJob(db, jobId);
  await assertCityAccess(ctx.actor, job.branchId, { entityType: 'job', entityId: job.id });

  const [company] = await db
    .select({
      id: co.id,
      branchId: co.branchId,
      status: co.status,
      legalName: co.legalName,
      tradeName: co.tradeName,
    })
    .from(co)
    .where(eq(co.id, input.companyId));
  if (!company) throw new NotFoundError('Company', input.companyId);
  if (company.status !== 'VERIFIED')
    throw new ForbiddenError('Jobs can only be referred to verified companies');
  await assertCityAccess(ctx.actor, company.branchId, {
    entityType: 'company',
    entityId: company.id,
  });

  const [existing] = await db
    .select()
    .from(jr)
    .where(and(eq(jr.jobId, job.id), eq(jr.companyId, company.id)));
  // Idempotent: the referral already exists, so there is nothing to write —
  // and runCommand would reject a write with no audit entry. The unique
  // index below is the backstop for a concurrent first referral.
  if (existing) return buildReferralView(db, existing, job.title, company);

  // M28: only live, open jobs go out to employers — staff cannot refer a
  // DRAFT job that was never published, or a CLOSED / EXPIRED / FILLED one.
  if (job.status !== 'OPEN')
    throw new ForbiddenError('Only open jobs can be referred to employers');

  let view: JobReferralView;
  try {
    view = await runCommand(ctx, async ({ tx, audit }) => {
      const [row] = await tx
        .insert(jr)
        .values({
          jobId: job.id,
          companyId: company.id,
          referredBy: ctx.actor.userId,
          note: input.note?.trim() ? input.note.trim() : null,
        })
        .returning();
      audit({
        action: 'job.refer',
        entityType: 'job',
        entityId: job.id,
        branchId: job.branchId,
        after: { companyId: company.id, note: row!.note },
      });
      return buildReferralView(db, row!, job.title, company);
    });
  } catch (error) {
    if (!isUniqueViolation(error, 'job_referrals_job_company_unique')) throw error;
    const [raced] = await db
      .select()
      .from(jr)
      .where(and(eq(jr.jobId, job.id), eq(jr.companyId, company.id)));
    if (!raced) throw error;
    return buildReferralView(db, raced, job.title, company);
  }

  // Notify the employer's users (outside the transaction, like the
  // candidate-referral fan-out in placement/index.ts).
  await notifyCompanyEmployers(db, company.id, ({ userId }) => ({
    userId,
    type: 'JOB_REFERRED',
    title: `New job referred — ${job.title}`,
    body: 'Saylani Job Bank referred this job to your company.',
    data: { jobId: job.id, companyId: company.id },
  }));

  return view;
}

async function buildReferralView(
  executor: typeof db,
  row: typeof jr.$inferSelect,
  jobTitle: string,
  company: { id: string; legalName: string; tradeName: string | null },
): Promise<JobReferralView> {
  const [referrer] = row.referredBy
    ? await executor.select({ name: us.name }).from(us).where(eq(us.id, row.referredBy))
    : [];
  return {
    id: row.id,
    jobId: row.jobId,
    jobTitle,
    companyId: row.companyId,
    companyName: company.tradeName ?? company.legalName,
    note: row.note,
    referredByName: referrer?.name ?? null,
    referredAt: row.createdAt.toISOString(),
  };
}

/** Verified companies in the staff member's city scope, for the refer picker. */
export async function listReferralTargets(actor: Actor): Promise<ReferralTarget[]> {
  assertPermission(actor, 'job:refer');
  const scope = cityScope(actor, co.branchId);
  const rows = await db
    .select({ id: co.id, legalName: co.legalName, tradeName: co.tradeName, branchId: co.branchId })
    .from(co)
    .where(and(eq(co.status, 'VERIFIED'), scope ?? undefined))
    .orderBy(desc(co.legalName));
  return rows.map((r) => ({ id: r.id, name: r.tradeName ?? r.legalName, branchId: r.branchId }));
}

/** Every employer a job has been referred to (staff view, newest first). */
export async function listJobReferrals(actor: Actor, jobId: string): Promise<JobReferralView[]> {
  assertPermission(actor, 'job:read');
  const job = await loadJob(db, jobId);
  await assertCityAccess(actor, job.branchId, { entityType: 'job', entityId: job.id });
  // H5: same pure-employer forcing as job/staff.ts listJobs/getJobDetail —
  // an actor with a company but neither job:manage nor job:refer sees only
  // referrals to their own company, never which other companies a job in
  // their city was referred to. (Pure employers stay fail-closed here by
  // assertCityAccess, as in getJobDetail; they read their own referrals
  // through listJobsForEmployer / getEmployerJob instead.)
  const ownCompanyId =
    actor.companyId && !hasPermission(actor, 'job:manage') && !hasPermission(actor, 'job:refer')
      ? actor.companyId
      : null;
  const rows = await db
    .select()
    .from(jr)
    .where(
      ownCompanyId
        ? and(eq(jr.jobId, job.id), eq(jr.companyId, ownCompanyId))
        : eq(jr.jobId, job.id),
    )
    .orderBy(desc(jr.createdAt));
  if (rows.length === 0) return [];
  const companies = await db
    .select({ id: co.id, legalName: co.legalName, tradeName: co.tradeName })
    .from(co)
    .where(
      inArray(
        co.id,
        rows.map((r) => r.companyId),
      ),
    );
  const byId = new Map(companies.map((c) => [c.id, c]));
  return Promise.all(
    rows.map((row) =>
      buildReferralView(
        db,
        row,
        job.title,
        byId.get(row.companyId) ?? {
          id: row.companyId,
          legalName: 'Unknown company',
          tradeName: null,
        },
      ),
    ),
  );
}

// ─── Employer: referred jobs ──────────────────────────────────────────────

/**
 * The employer's Jobs list: their own company's postings plus jobs staff
 * referred to their company, newest activity first. A job that is both
 * (own posting, also referred back) appears once, as OWN.
 *
 * M32 — pagination: pass a ListQuery (parsed with parseListQuery, pageSize
 * capped at 100 by the helper) to get one page plus pagination metadata.
 * The sort is fixed to newest-activity-first (referredAt ?? createdAt); the
 * query's sort field is ignored. Without a query the full list is returned,
 * as before — the dashboard and the jobs page still call it that way.
 */
export async function listJobsForEmployer(actor: Actor): Promise<EmployerJobListItem[]>;
export async function listJobsForEmployer(
  actor: Actor,
  query: Pick<
    ListQuery<'createdAt', Record<string, never>>,
    'page' | 'pageSize' | 'offset' | 'limit'
  >,
): Promise<{ items: EmployerJobListItem[]; pagination: PaginationMeta }>;
export async function listJobsForEmployer(
  actor: Actor,
  query?: Pick<
    ListQuery<'createdAt', Record<string, never>>,
    'page' | 'pageSize' | 'offset' | 'limit'
  >,
): Promise<EmployerJobListItem[] | { items: EmployerJobListItem[]; pagination: PaginationMeta }> {
  assertPermission(actor, 'job:read');
  if (!actor.companyId) return query ? { items: [], pagination: paginationMeta(query, 0) } : [];

  // Cheap id-only pass first: buildJobView runs 3 queries per job, so it
  // only ever runs for the page being returned.
  const [ownIds, referredRows] = await Promise.all([
    db.select({ id: j.id, createdAt: j.createdAt }).from(j).where(eq(j.companyId, actor.companyId)),
    db
      .select({ jobId: jr.jobId, referredAt: jr.createdAt, note: jr.note })
      .from(jr)
      .innerJoin(j, eq(j.id, jr.jobId))
      .where(eq(jr.companyId, actor.companyId)),
  ]);

  const ownIdSet = new Set(ownIds.map((row) => row.id));
  const descriptors: {
    jobId: string;
    sortKey: Date;
    source: 'OWN' | 'REFERRED';
    referredAt: Date | null;
    referralNote: string | null;
  }[] = [
    ...ownIds.map((row) => ({
      jobId: row.id,
      sortKey: row.createdAt,
      source: 'OWN' as const,
      referredAt: null,
      referralNote: null,
    })),
    ...referredRows
      .filter(({ jobId }) => !ownIdSet.has(jobId))
      .map(({ jobId, referredAt, note }) => ({
        jobId,
        sortKey: referredAt,
        source: 'REFERRED' as const,
        referredAt,
        referralNote: note,
      })),
  ];
  descriptors.sort((a, b) => b.sortKey.getTime() - a.sortKey.getTime());

  const page = query ? descriptors.slice(query.offset, query.offset + query.limit) : descriptors;
  const rows =
    page.length === 0
      ? []
      : await db
          .select()
          .from(j)
          .where(
            inArray(
              j.id,
              page.map((d) => d.jobId),
            ),
          );
  const byId = new Map(rows.map((row) => [row.id, row]));
  const items: EmployerJobListItem[] = (
    await Promise.all(
      page.map(async (d) => {
        const row = byId.get(d.jobId);
        if (!row) return null;
        return {
          ...(await buildJobView(db, row)),
          source: d.source,
          referredAt: d.referredAt?.toISOString() ?? null,
          referralNote: d.referralNote,
        };
      }),
    )
  ).filter((item): item is EmployerJobListItem => item !== null);

  if (!query) return items;
  return { items, pagination: paginationMeta(query, descriptors.length) };
}

/**
 * One job for an employer: their own posting, or a job referred to their
 * company. Anything else is a 404 — employers never see other jobs.
 */
export async function getEmployerJob(actor: Actor, jobId: string): Promise<EmployerJobListItem> {
  assertPermission(actor, 'job:read');
  const row = await loadJob(db, jobId);
  if (actor.companyId && row.companyId === actor.companyId) {
    return {
      ...(await buildJobView(db, row)),
      source: 'OWN',
      referredAt: null,
      referralNote: null,
    };
  }
  if (!actor.companyId) throw new NotFoundError('Job', jobId);
  const [referral] = await db
    .select()
    .from(jr)
    .where(and(eq(jr.jobId, jobId), eq(jr.companyId, actor.companyId)));
  if (!referral) throw new NotFoundError('Job', jobId);
  return {
    ...(await buildJobView(db, row)),
    source: 'REFERRED',
    referredAt: referral.createdAt.toISOString(),
    referralNote: referral.note,
  };
}

/** Does this employer have anything to show under Jobs (own or referred)? */
export async function hasVisibleEmployerJobs(actor: Actor): Promise<boolean> {
  if (!actor.companyId) return false;
  const [own, referred] = await Promise.all([
    db.select({ value: count() }).from(j).where(eq(j.companyId, actor.companyId)),
    db.select({ value: count() }).from(jr).where(eq(jr.companyId, actor.companyId)),
  ]);
  return (own[0]?.value ?? 0) + (referred[0]?.value ?? 0) > 0;
}

// ─── Employer: referral analytics ─────────────────────────────────────────

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

/** Real referral numbers for the employer dashboard — no fabricated counts. */
export async function getEmployerReferralStats(actor: Actor): Promise<EmployerReferralStats> {
  const empty: EmployerReferralStats = {
    totalReferred: 0,
    byStatus: { DRAFT: 0, OPEN: 0, PAUSED: 0, FILLED: 0, CLOSED: 0, EXPIRED: 0 },
    openReferred: 0,
    referredLast30Days: 0,
    candidatesReferred: 0,
    hiredFromReferred: 0,
    latestReferredAt: null,
  };
  if (!actor.companyId) return empty;

  const referred = await db
    .select({ jobId: jr.jobId, status: j.status, referredAt: jr.createdAt })
    .from(jr)
    .innerJoin(j, eq(j.id, jr.jobId))
    .where(eq(jr.companyId, actor.companyId));
  if (referred.length === 0) return empty;

  const byStatus = { ...empty.byStatus };
  for (const r of referred) byStatus[r.status as JobStatus] += 1;
  const thirtyDaysAgo = Date.now() - 30 * 86_400_000;
  const referredLast30Days = referred.filter((r) => r.referredAt.getTime() >= thirtyDaysAgo).length;
  const latestReferredAt = referred.map((r) => r.referredAt.getTime()).sort((a, b) => b - a)[0]!;

  const jobIds = referred.map((r) => r.jobId);
  const [candidates, hireEvents] = await Promise.all([
    db
      .select({ value: count() })
      .from(ap)
      .where(
        and(
          inArray(ap.jobId, jobIds),
          inArray(ap.status, [...EMPLOYER_VISIBLE_APPLICATION_STATUSES]),
        ),
      ),
    listHireEvents(jobIds),
  ]);

  return {
    totalReferred: referred.length,
    byStatus,
    openReferred: byStatus.OPEN,
    referredLast30Days,
    candidatesReferred: candidates[0]?.value ?? 0,
    hiredFromReferred: hireEvents.length,
    latestReferredAt: new Date(latestReferredAt).toISOString(),
  };
}

/** Count helper used by the employer dashboard pipeline (own + referred jobs). */
export async function countEmployerCandidates(
  actor: Actor,
): Promise<{ referred: number; hired: number }> {
  if (!actor.companyId) return { referred: 0, hired: 0 };
  const jobIds = await visibleEmployerJobIds(actor);
  if (jobIds.length === 0) return { referred: 0, hired: 0 };
  const [candidates, hireEvents] = await Promise.all([
    db
      .select({ value: count() })
      .from(ap)
      .where(
        and(
          inArray(ap.jobId, jobIds),
          inArray(ap.status, [...EMPLOYER_VISIBLE_APPLICATION_STATUSES]),
        ),
      ),
    listHireEvents(jobIds),
  ]);
  return { referred: candidates[0]?.value ?? 0, hired: hireEvents.length };
}

/** Job ids the employer can see: their own postings + jobs referred to their company. */
async function visibleEmployerJobIds(actor: Actor): Promise<string[]> {
  if (!actor.companyId) return [];
  const [own, referred] = await Promise.all([
    db.select({ id: j.id }).from(j).where(eq(j.companyId, actor.companyId)),
    db.select({ jobId: jr.jobId }).from(jr).where(eq(jr.companyId, actor.companyId)),
  ]);
  return [...new Set([...own.map((row) => row.id), ...referred.map((row) => row.jobId)])];
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
 * Monthly hires for the employer's visible jobs, current calendar year.
 * Bucketed by hire time in Asia/Karachi (M1); months with no hires are 0.
 * Signature unchanged, so the employer dashboard chart keeps working.
 */
export async function countHiresByMonth(actor: Actor, year: number): Promise<number[]> {
  const zeros = Array.from({ length: 12 }, () => 0);
  if (!actor.companyId) return zeros;
  const jobIds = await visibleEmployerJobIds(actor);
  if (jobIds.length === 0) return zeros;
  const hires = await listHireEvents(jobIds);
  for (const hire of hires) {
    if (!hire.hiredAt) continue;
    const { year: hireYear, month } = pktYearMonth(hire.hiredAt);
    if (hireYear === year && month >= 1 && month <= 12)
      zeros[month - 1] = (zeros[month - 1] ?? 0) + 1;
  }
  return zeros;
}
