import 'server-only';
import { schema } from '@jobbank/db';
import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import { z } from 'zod';
import { createNotification } from '@/domains/notifications';
import { runCommand } from '@/domains/shared/audit';
import type { RequestContext } from '@/domains/shared/audit';
import { ForbiddenError, isUniqueViolation, NotFoundError } from '@/domains/shared/errors';
import { assertCityAccess, assertPermission, cityScope, type Actor } from '@/domains/shared/scope';
import { db } from '@/lib/db';
import { buildJobView, j, loadJob, type JobView } from './repository';

type SignedIn = RequestContext & { actor: Actor };

const ap = schema.applicants;
const jar = schema.jobApplicantReferrals;

// ─── Types ────────────────────────────────────────────────────────────────

export interface JobApplicantReferralView {
  id: string;
  jobId: string;
  jobTitle: string;
  applicantId: string;
  applicantName: string | null;
  note: string | null;
  referredByName: string | null;
  referredAt: string;
}

/** An applicant the staff member may refer this job to. */
export interface ReferrableApplicant {
  id: string;
  fullName: string;
  branchId: string | null;
  identityStatus: string;
}

/** A job as the applicant sees it: only jobs staff referred to them. */
export interface ReferredJobView extends JobView {
  referredAt: string;
  referralNote: string | null;
}

// ─── Schemas ──────────────────────────────────────────────────────────────

export const referJobToApplicantSchema = z.object({
  applicantId: z.uuid(),
  note: z.string().trim().max(500).optional(),
});
export type ReferJobToApplicantInput = z.infer<typeof referJobToApplicantSchema>;

// ─── Rules (pure, unit-tested) ────────────────────────────────────────────

/**
 * Who staff may refer a job to, for now (user decision 2026-11-09, interim
 * "filhal" rule): any profile that is not RESTRICTED — ACTIVE or INACTIVE —
 * with an identity that is VERIFIED or still UNVERIFIED. (The DRAFT status
 * was removed 2026-11-09, so there is no draft case any more.)
 * A RESTRICTED profile (admin-imposed) or a REJECTED identity may not be
 * referred. The check lives in this one function; listReferrableApplicants
 * mirrors it in SQL below.
 */
export function isReferrableApplicant(row: { status: string; identityStatus: string }): boolean {
  return (
    row.status !== 'RESTRICTED' &&
    (row.identityStatus === 'VERIFIED' || row.identityStatus === 'UNVERIFIED')
  );
}

// ─── Staff: refer a job to an applicant ───────────────────────────────────

/**
 * Staff shares an open job with a specific applicant in their city scope
 * (any non-rejected profile, verified or unverified for now — see
 * isReferrableApplicant).
 * Idempotent: referring the same job to the same applicant twice
 * returns the first referral instead of a duplicate row (the unique index
 * is the backstop, not the guard).
 */
export async function referJobToApplicant(
  ctx: SignedIn,
  jobId: string,
  input: ReferJobToApplicantInput,
): Promise<JobApplicantReferralView> {
  assertPermission(ctx.actor, 'job:refer');
  const job = await loadJob(db, jobId);
  await assertCityAccess(ctx.actor, job.branchId, { entityType: 'job', entityId: job.id });

  const [applicant] = await db
    .select({
      id: ap.id,
      userId: ap.userId,
      fullName: ap.fullName,
      branchId: ap.branchId,
      status: ap.status,
      identityStatus: ap.identityStatus,
    })
    .from(ap)
    .where(eq(ap.id, input.applicantId));
  if (!applicant) throw new NotFoundError('Applicant', input.applicantId);
  if (!isReferrableApplicant(applicant))
    throw new ForbiddenError('Jobs cannot be referred to restricted or rejected applicants');
  await assertCityAccess(ctx.actor, applicant.branchId, {
    entityType: 'applicant',
    entityId: applicant.id,
  });

  const [existing] = await db
    .select()
    .from(jar)
    .where(and(eq(jar.jobId, job.id), eq(jar.applicantId, applicant.id)));
  // M28 rule, mirrored: only live, open jobs go out — staff cannot refer a
  // DRAFT job that was never published, or a CLOSED / EXPIRED / FILLED one.
  // Audit 2026-11-10 (C-F12/D-F5): this check used to run AFTER the
  // idempotent return, so re-posting a referral for a now-CLOSED job
  // returned success; and a suspended company's jobs were still referrable.
  // Both checks now run before the early return.
  if (job.status !== 'OPEN')
    throw new ForbiddenError('Only open jobs can be referred to applicants');
  const [companyRow] = await db
    .select({ status: schema.companies.status })
    .from(schema.companies)
    .where(eq(schema.companies.id, job.companyId));
  if (companyRow?.status !== 'VERIFIED')
    throw new ForbiddenError('Only verified companies can receive referred candidates');

  // Idempotent: the referral already exists, so there is nothing to write —
  // and runCommand would reject a write with no audit entry. The unique
  // index below is the backstop for a concurrent first referral.
  if (existing) return buildReferralView(db, existing, job.title, applicant);

  let view: JobApplicantReferralView;
  try {
    view = await runCommand(ctx, async ({ tx, audit }) => {
      const [row] = await tx
        .insert(jar)
        .values({
          jobId: job.id,
          applicantId: applicant.id,
          referredBy: ctx.actor.userId,
          note: input.note?.trim() ? input.note.trim() : null,
        })
        .returning();
      audit({
        action: 'job.refer_to_applicant',
        entityType: 'job',
        entityId: job.id,
        branchId: job.branchId,
        after: { applicantId: applicant.id, note: row!.note },
      });
      return buildReferralView(db, row!, job.title, applicant);
    });
  } catch (error) {
    if (!isUniqueViolation(error, 'job_applicant_referrals_job_applicant_unique')) throw error;
    const [raced] = await db
      .select()
      .from(jar)
      .where(and(eq(jar.jobId, job.id), eq(jar.applicantId, applicant.id)));
    if (!raced) throw error;
    return buildReferralView(db, raced, job.title, applicant);
  }

  // Notify the applicant (outside the transaction, like the candidate-referral
  // fan-out in placement/index.ts).
  await createNotification(db, {
    userId: applicant.userId,
    type: 'JOB_REFERRED_TO_APPLICANT',
    title: `New job referred to you — ${job.title}`,
    body: 'Saylani Job Bank referred this job to you. Open it to see the details.',
    data: { jobId: job.id, applicantId: applicant.id, referralId: view.id },
  });

  return view;
}

async function buildReferralView(
  executor: typeof db,
  row: typeof jar.$inferSelect,
  jobTitle: string,
  applicant: { id: string; fullName: string },
): Promise<JobApplicantReferralView> {
  const [referrer] = row.referredBy
    ? await executor
        .select({ name: schema.users.name })
        .from(schema.users)
        .where(eq(schema.users.id, row.referredBy))
    : [];
  return {
    id: row.id,
    jobId: row.jobId,
    jobTitle,
    applicantId: row.applicantId,
    applicantName: applicant.fullName,
    note: row.note,
    referredByName: referrer?.name ?? null,
    referredAt: row.createdAt.toISOString(),
  };
}

/** Applicants in the staff member's city scope, for the refer picker. */
export async function listReferrableApplicants(actor: Actor): Promise<ReferrableApplicant[]> {
  assertPermission(actor, 'job:refer');
  const scope = cityScope(actor, ap.branchId);
  const rows = await db
    .select({
      id: ap.id,
      fullName: ap.fullName,
      branchId: ap.branchId,
      identityStatus: ap.identityStatus,
    })
    .from(ap)
    .where(
      and(
        ne(ap.status, 'RESTRICTED'),
        inArray(ap.identityStatus, ['VERIFIED', 'UNVERIFIED']),
        scope ?? undefined,
      ),
    )
    .orderBy(asc(ap.fullName));
  return rows;
}

/** Every applicant a job has been referred to (staff view, newest first). */
export async function listJobApplicantReferrals(
  actor: Actor,
  jobId: string,
): Promise<JobApplicantReferralView[]> {
  assertPermission(actor, 'job:read');
  const job = await loadJob(db, jobId);
  await assertCityAccess(actor, job.branchId, { entityType: 'job', entityId: job.id });
  const rows = await db
    .select()
    .from(jar)
    .where(eq(jar.jobId, job.id))
    .orderBy(desc(jar.createdAt));
  if (rows.length === 0) return [];
  const applicants = await db
    .select({ id: ap.id, fullName: ap.fullName })
    .from(ap)
    .where(
      inArray(
        ap.id,
        rows.map((r) => r.applicantId),
      ),
    );
  const byId = new Map(applicants.map((a) => [a.id, a]));
  return Promise.all(
    rows.map((row) =>
      buildReferralView(
        db,
        row,
        job.title,
        byId.get(row.applicantId) ?? { id: row.applicantId, fullName: 'Unknown applicant' },
      ),
    ),
  );
}

// ─── Applicant: jobs referred to them ─────────────────────────────────────

/**
 * The applicant's Jobs list: ONLY jobs staff referred to them, newest
 * referral first. The interim rule (workflow §4.4, "filhal") replaces the
 * matching-based discovery the page used to show.
 */
export async function listReferredJobsForApplicant(actor: Actor): Promise<ReferredJobView[]> {
  assertPermission(actor, 'job:read');
  const [own] = await db.select({ id: ap.id }).from(ap).where(eq(ap.userId, actor.userId));
  if (!own) throw new NotFoundError('Applicant profile');
  const referrals = await db
    .select({ jobId: jar.jobId, referredAt: jar.createdAt, note: jar.note })
    .from(jar)
    .where(eq(jar.applicantId, own.id))
    .orderBy(desc(jar.createdAt));
  if (referrals.length === 0) return [];
  const jobs = await db
    .select()
    .from(j)
    .where(
      inArray(
        j.id,
        referrals.map((r) => r.jobId),
      ),
    );
  const byId = new Map(jobs.map((row) => [row.id, row]));
  const items: ReferredJobView[] = (
    await Promise.all(
      referrals.map(async (r) => {
        const row = byId.get(r.jobId);
        if (!row) return null;
        return {
          ...(await buildJobView(db, row)),
          referredAt: r.referredAt.toISOString(),
          referralNote: r.note,
        };
      }),
    )
  ).filter((item): item is ReferredJobView => item !== null);
  return items;
}
