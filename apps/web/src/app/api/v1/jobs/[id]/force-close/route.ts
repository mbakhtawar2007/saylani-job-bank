import { z } from 'zod';
import { forceCloseJob } from '@/domains/job';
import { apiHandler, ok } from '@/domains/shared/http';

/**
 * POST /api/v1/jobs/[id]/force-close — Branch Admin / Super Admin / Verifier
 * closes an OPEN or PAUSED job (H16). The route permission ('company:manage')
 * is held by exactly those three roles; forceCloseJob re-checks the roles
 * and the job's city scope. Body is an optional note; an empty body is
 * accepted.
 */
const paramsSchema = z.object({ id: z.uuid() });
const bodySchema = z.object({ note: z.string().trim().max(500).optional() }).default({});

export const POST = apiHandler({
  permission: 'company:manage',
  params: paramsSchema,
  body: bodySchema,
  handler: async ({ ctx, actor, params, body }) =>
    ok(await forceCloseJob({ ...ctx, actor: actor! }, params.id, body?.note)),
});
