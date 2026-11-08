import 'server-only';
import { schema } from '@jobbank/db';
import { and, eq, inArray, lt } from 'drizzle-orm';
import { runCommand, type RequestContext } from '@/domains/shared/audit';
import { db } from '@/lib/db';
import { jobMachine } from './machine';
import { loadJob } from './repository';

/**
 * Close every OPEN/PAUSED job whose closesAt has passed. Jobs otherwise stay
 * OPEN forever: nothing in the app fires EXPIRE on its own. Run from the
 * maintenance route (Super Admin, by hand) or from whatever schedules the
 * deployment — the repo has no scheduler, same as stale-uploads.
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
