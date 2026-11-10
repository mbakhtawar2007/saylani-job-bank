import { z } from 'zod';
import { staffUpdateJob } from '@/domains/job';
import { apiHandler, ok } from '@/domains/shared/http';
import { updateJobSchema } from '@jobbank/shared';

/** PATCH /api/v1/companies/[id]/jobs/[jobId] — edit a job in this company. */
export const PATCH = apiHandler({
  permission: 'job:manage',
  params: z.object({ id: z.uuid(), jobId: z.uuid() }),
  body: updateJobSchema,
  handler: async ({ ctx, actor, params, body }) =>
    ok(await staffUpdateJob({ ...ctx, actor: actor! }, params.jobId, body, params.id)),
});
