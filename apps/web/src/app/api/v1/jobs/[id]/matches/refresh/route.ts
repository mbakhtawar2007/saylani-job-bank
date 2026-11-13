import { z } from 'zod';
import { requestJobMatchesRefresh } from '@/domains/matching';
import { apiHandler, ok } from '@/domains/shared/http';

/**
 * POST /api/v1/jobs/{id}/matches/refresh — queue a shortlist rebuild (audited,
 * rate-limited to 5/min per actor+job in the service). The Python worker runs it.
 * First gate is the role list (`match_case:manage` or the owning employer's
 * `job:manage_own`); the service still asserts the exact permission.
 */
export const POST = apiHandler({
  roles: ['STAFF', 'BRANCH_ADMIN', 'EMPLOYER'],
  params: z.object({ id: z.uuid() }),
  handler: async ({ ctx, actor, params }) =>
    ok(await requestJobMatchesRefresh({ ...ctx, actor: actor! }, params.id)),
});
