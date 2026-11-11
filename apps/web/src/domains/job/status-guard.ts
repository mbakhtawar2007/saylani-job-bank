import 'server-only';
import { schema } from '@jobbank/db';
import type { JobStatus } from '@jobbank/shared';
import { eq } from 'drizzle-orm';
import { ConflictError, ForbiddenError, NotFoundError } from '@/domains/shared/errors';
import type { DbExecutor } from '@/lib/db';

/**
 * One shared job-state guard for the whole referral/hiring pipeline (audit
 * 2026-11-11, H-10/H-11/H-12, M-09). Before this fix every pipeline step
 * checked the job's status differently — or not at all — so a candidate could
 * be forwarded, interviewed, decided on, or hired for a CLOSED/EXPIRED/
 * FILLED job. The rule, in one place:
 *
 * - New referrals (shortlist, direct refer, job→applicant, two-step forward)
 *   require the job to be OPEN. PAUSED blocks new referrals in both
 *   directions (verified intent); the in-flight pipeline keeps moving.
 * - In-flight steps (employer decisions, offer accept/refuse, JobBank and
 *   employer interviews) require the job to be OPEN or PAUSED — never
 *   CLOSED, EXPIRED or FILLED.
 * - Accepting an offer additionally requires a free vacancy.
 *
 * Callers do a fast pre-check on `db` for a clear error, then re-check under
 * the job row lock inside the transaction, so a close landing between the
 * check and the write cannot slip through.
 */
export interface GuardedJob {
  id: string;
  status: JobStatus;
  vacancies: number;
  vacanciesFilled: number;
  companyId: string;
}

const JOB_COLUMNS = {
  id: schema.jobs.id,
  status: schema.jobs.status,
  vacancies: schema.jobs.vacancies,
  vacanciesFilled: schema.jobs.vacanciesFilled,
  companyId: schema.jobs.companyId,
};

/** Read-only pre-check (no lock). Always re-check under lock in the transaction. */
export async function loadJob(executor: DbExecutor, jobId: string): Promise<GuardedJob> {
  const [job] = await executor
    .select(JOB_COLUMNS)
    .from(schema.jobs)
    .where(eq(schema.jobs.id, jobId))
    .limit(1);
  if (!job) throw new NotFoundError('Job', jobId);
  return job;
}

/** Locked read inside a transaction — serialises with close/fill paths. */
export async function loadJobForUpdate(tx: DbExecutor, jobId: string): Promise<GuardedJob> {
  const [job] = await tx
    .select(JOB_COLUMNS)
    .from(schema.jobs)
    .where(eq(schema.jobs.id, jobId))
    .for('update');
  if (!job) throw new NotFoundError('Job', jobId);
  return job;
}

/** New referrals only ever start on an OPEN job. */
export function assertJobOpen(job: GuardedJob, action: string): void {
  if (job.status !== 'OPEN') {
    throw new ForbiddenError(
      `Cannot ${action}: this job is ${job.status.toLowerCase()} (only open jobs accept new referrals)`,
    );
  }
}

/** In-flight pipeline steps may proceed while OPEN or PAUSED, never once closed/expired/filled. */
export function assertJobLive(job: GuardedJob, action: string): void {
  if (job.status !== 'OPEN' && job.status !== 'PAUSED') {
    throw new ForbiddenError(
      `Cannot ${action}: this job is ${job.status.toLowerCase()}`,
    );
  }
}

/** Accepting an offer requires a free vacancy (checked under the job lock). */
export function assertVacancyAvailable(job: GuardedJob): void {
  if (job.vacanciesFilled >= job.vacancies) {
    throw new ConflictError('This job has no open vacancies', {
      reason: 'NO_VACANCY',
    });
  }
}
