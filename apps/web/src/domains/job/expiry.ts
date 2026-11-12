import 'server-only';
import { schema } from '@jobbank/db';
import { and, eq, inArray, lt } from 'drizzle-orm';
import { runCommand, type RequestContext } from '@/domains/shared/audit';
import { db } from '@/lib/db';
import { jobMachine } from './machine';
import { loadJob } from './repository';

/** Daily expiry run time, just after midnight PKT (19:05 UTC). */
export const EXPIRY_RUN_HOUR_UTC = 19;
export const EXPIRY_RUN_MINUTE_UTC = 5;

/**
 * Milliseconds from `now` until the next daily expiry run (19:05 UTC).
 * Pure, so the schedule is unit-testable without timers. A `now` exactly
 * on the run time waits until tomorrow — the run itself is idempotent, but
 * scheduling a 0ms first run after a restart would double-fire with the
 * manual route if an admin happened to run it at the same minute.
 */
export function msUntilNextExpiryRun(now: Date = new Date()): number {
  const next = new Date(now);
  next.setUTCHours(EXPIRY_RUN_HOUR_UTC, EXPIRY_RUN_MINUTE_UTC, 0, 0);
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

/**
 * Close every OPEN/PAUSED job whose closesAt has passed. Fired daily at
 * 19:05 UTC by the in-process scheduler (apps/web/src/instrumentation.ts,
 * production only), and on demand from the maintenance route (Super Admin,
 * by hand). Safe to run twice: each candidate is re-checked under a row
 * lock, so a second run finds nothing left to close.
 */
export async function expirePastCloseJobs(
  ctx: RequestContext,
): Promise<{ expired: number; jobIds: string[] }> {
  const now = new Date();
  const candidates = await db
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .where(and(inArray(schema.jobs.status, ['OPEN', 'PAUSED']), lt(schema.jobs.closesAt, now)));

  const expired: string[] = [];
  for (const candidate of candidates) {
    const did = await runCommand(ctx, async ({ tx, audit }) => {
      const job = await loadJob(tx, candidate.id, { forUpdate: true });
      if (!['OPEN', 'PAUSED'].includes(job.status)) return false;
      if (!job.closesAt || job.closesAt >= now) return false;
      const check = jobMachine.check(job.status, 'EXPIRE', {}, 'system');
      if (!check.ok) return false;
      const closedAt = new Date();
      await tx
        .update(schema.jobs)
        .set({ status: check.to, closedAt, updatedAt: closedAt })
        .where(eq(schema.jobs.id, job.id));
      audit({
        action: 'job.expire',
        entityType: 'job',
        entityId: job.id,
        branchId: job.branchId,
      });
      return true;
    });
    if (did) expired.push(candidate.id);
  }
  return { expired: expired.length, jobIds: expired };
}
