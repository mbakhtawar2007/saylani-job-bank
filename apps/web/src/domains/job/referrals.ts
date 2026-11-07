import 'server-only';
import { schema } from '@jobbank/db';
import type { JobStatus } from '@jobbank/shared';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { runCommand } from '@/domains/shared/audit';
import type { RequestContext } from '@/domains/shared/audit';
import { ForbiddenError, isUniqueViolation, NotFoundError } from '@/domains/shared/errors';
import { assertCityAccess, assertPermission, cityScope, type Actor } from '@/domains/shared/scope';
import { notifyCompanyEmployers } from '@/domains/notifications';
import { db } from '@/lib/db';
import { buildJobView, j, loadJob, type JobView } from './repository';

type SignedIn = RequestContext & { actor: Actor };

const jr = schema.jobReferrals;
const co = schema.companies;
const us = schema.users;
const ap = schema.applications;

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
  const rows = await db.select().from(jr).where(eq(jr.jobId, job.id)).orderBy(desc(jr.createdAt));
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
 */
export async function listJobsForEmployer(actor: Actor): Promise<EmployerJobListItem[]> {
  assertPermission(actor, 'job:read');
  if (!actor.companyId) return [];

  const [ownRows, referredRows] = await Promise.all([
    db.select().from(j).where(eq(j.companyId, actor.companyId)),
    db
      .select({ job: j, referredAt: jr.createdAt, note: jr.note })
      .from(jr)
      .innerJoin(j, eq(j.id, jr.jobId))
      .where(eq(jr.companyId, actor.companyId)),
  ]);

  const ownIds = new Set(ownRows.map((row) => row.id));
  const [ownViews, referredViews] = await Promise.all([
    Promise.all(ownRows.map((row) => buildJobView(db, row))),
    Promise.all(
      referredRows
        .filter(({ job }) => !ownIds.has(job.id))
        .map(async ({ job, referredAt, note }) => ({
          ...(await buildJobView(db, job)),
          source: 'REFERRED' as const,
          referredAt: referredAt.toISOString(),
          referralNote: note,
        })),
    ),
  ]);
  const items: EmployerJobListItem[] = [
    ...ownViews.map((view) => ({
      ...view,
      source: 'OWN' as const,
      referredAt: null,
      referralNote: null,
    })),
    ...referredViews,
  ];
  items.sort((a, b) => {
    const da = new Date(a.referredAt ?? a.createdAt).getTime();
    const dbTime = new Date(b.referredAt ?? b.createdAt).getTime();
    return dbTime - da;
  });
  return items;
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
  const [candidates, hired] = await Promise.all([
    db
      .select({ value: count() })
      .from(ap)
      .where(
        and(
          inArray(ap.jobId, jobIds),
          inArray(ap.status, [...EMPLOYER_VISIBLE_APPLICATION_STATUSES]),
        ),
      ),
    db
      .select({ value: count() })
      .from(ap)
      .where(and(inArray(ap.jobId, jobIds), eq(ap.status, 'HIRED'))),
  ]);

  return {
    totalReferred: referred.length,
    byStatus,
    openReferred: byStatus.OPEN,
    referredLast30Days,
    candidatesReferred: candidates[0]?.value ?? 0,
    hiredFromReferred: hired[0]?.value ?? 0,
    latestReferredAt: new Date(latestReferredAt).toISOString(),
  };
}

/** Count helper used by the employer dashboard pipeline (own + referred jobs). */
export async function countEmployerCandidates(
  actor: Actor,
): Promise<{ referred: number; hired: number }> {
  if (!actor.companyId) return { referred: 0, hired: 0 };
  const jobs = await listJobsForEmployer(actor);
  if (jobs.length === 0) return { referred: 0, hired: 0 };
  const jobIds = jobs.map((job) => job.id);
  const [candidates, hired] = await Promise.all([
    db
      .select({ value: count() })
      .from(ap)
      .where(
        and(
          inArray(ap.jobId, jobIds),
          inArray(ap.status, [...EMPLOYER_VISIBLE_APPLICATION_STATUSES]),
        ),
      ),
    db
      .select({ value: count() })
      .from(ap)
      .where(and(inArray(ap.jobId, jobIds), eq(ap.status, 'HIRED'))),
  ]);
  return { referred: candidates[0]?.value ?? 0, hired: hired[0]?.value ?? 0 };
}
