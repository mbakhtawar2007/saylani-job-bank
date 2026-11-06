import { sweepStaleUploads } from '@/domains/maintenance';
import { apiHandler, ok } from '@/domains/shared/http';

/**
 * POST /api/v1/admin/maintenance/stale-uploads — expire abandoned document
 * uploads (Super Admin only). Returns how many PENDING_UPLOAD rows were
 * retired per domain and how many storage objects were deleted.
 *
 * HOW IT RUNS: the repo has no scheduler — no cron config, no background
 * worker, no existing sweep to follow. Until one exists, run this daily by
 * hand (a Super Admin POSTs here, e.g. from the admin console or curl with a
 * session cookie) or from whatever schedules the deployment (e.g. Vercel
 * Cron POSTing here). Before wiring it to an unattended caller, add a
 * shared-secret header check (CRON_SECRET in env): an unattended scheduler
 * cannot hold a user session, so the Super Admin role gate alone does not
 * authenticate it. Until then, manual / Super-Admin invocation only.
 */
export const POST = apiHandler({
  roles: ['SUPER_ADMIN'],
  handler: async ({ ctx }) => ok(await sweepStaleUploads(ctx)),
});
