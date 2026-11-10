import { z } from 'zod';
import { staffChangeJobStatus } from '@/domains/job';
import { apiHandler, ok } from '@/domains/shared/http';
import { jobStatusSchema } from '@jobbank/shared';

/** PATCH /api/v1/companies/[id]/jobs/[jobId]/status — archive within this company. */
export const PATCH = apiHandler({
  permission: 'job:manage',
  params: z.object({ id: z.uuid(), jobId: z.uuid() }),
  body: jobStatusSchema,
  handler: async ({ ctx, actor, params, body }) =>
    ok(await staffChangeJobStatus({ ...ctx, actor: actor! }, params.jobId, body, params.id)),
});
