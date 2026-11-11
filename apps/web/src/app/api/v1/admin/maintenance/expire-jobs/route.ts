import { timingSafeEqual } from 'node:crypto';
import { expirePastCloseJobs } from '@/domains/job';
import { systemContext } from '@/domains/shared/audit';
import { ForbiddenError, UnauthenticatedError } from '@/domains/shared/errors';
import { apiHandler, ok } from '@/domains/shared/http';
import { hasRole } from '@/domains/shared/scope';
import { env } from '@/lib/env';

/**
 * POST /api/v1/admin/maintenance/expire-jobs — close OPEN/PAUSED jobs whose
 * closesAt has passed. Returns how many jobs expired.
 *
 * Two callers, same work:
 * - A signed-in Super Admin (the manual path — the admin console or curl
 *   with a session cookie), audited under that admin.
 * - An unattended scheduler (audit 2026-11-11, L-05): it sends the shared
 *   secret in the `x-cron-secret` header, or as `Authorization: Bearer
 *   <CRON_SECRET>` (what Vercel Cron sends by default). The call runs under
 *   context, so audit rows record actorRole SYSTEM. A scheduler cannot hold
 *   a user session, so the Super Admin role gate alone cannot authenticate
 *   it — and a wrong or missing secret falls through to the session gate,
 *   never to an open door. Leave CRON_SECRET unset and no cron bypass
 *   exists at all.
 *
 * SCHEDULING: the repo has no scheduler config (no vercel.json, no
 * netlify.toml) and the deployment target is not recorded anywhere, so the
 * schedule itself is NOT wired here — see the README "Job expiry" section
 * for the exact cron to add once the target is confirmed. Daily, just after
 * midnight PKT (19:05 UTC).
 */
export const POST = apiHandler({
  auth: 'public',
  handler: async ({ ctx, request }) => {
    if (hasCronSecret(request)) {
      return ok(await expirePastCloseJobs(systemContext('expire-jobs', ctx.correlationId)));
    }
    if (!ctx.actor) throw new UnauthenticatedError();
    if (!hasRole(ctx.actor, 'SUPER_ADMIN')) {
      throw new ForbiddenError('Super Admin only');
    }
    return ok(await expirePastCloseJobs(ctx));
  },
});

/** Timing-safe compare, mirroring hasInternalWriteToken in handler.ts. */
function hasCronSecret(request: Request): boolean {
  const expected = env.CRON_SECRET;
  if (!expected) return false;
  const presented =
    request.headers.get('x-cron-secret') ??
    // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` by default and
    // no custom header — accept it as the same secret, not a second one.
    request.headers.get('authorization')?.replace(/^Bearer /i, '');
  if (!presented) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
