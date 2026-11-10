import { z } from 'zod';
import { staffCreateJob } from '@/domains/job';
import { apiHandler, created } from '@/domains/shared/http';
import { createJobSchema } from '@jobbank/shared';

/** POST /api/v1/companies/[id]/jobs — create a draft job for this company. */
export const POST = apiHandler({
  permission: 'job:manage',
  params: z.object({ id: z.uuid() }),
  body: createJobSchema,
  idempotent: true,
  handler: async ({ ctx, actor, params, body }) =>
    created(await staffCreateJob({ ...ctx, actor: actor! }, params.id, body)),
});
