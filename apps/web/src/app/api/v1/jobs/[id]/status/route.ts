import { z } from 'zod';
import { staffChangeJobStatus } from '@/domains/job';
import { apiHandler, ok } from '@/domains/shared/http';
import { jobStatusSchema } from '@jobbank/shared';

export const PATCH = apiHandler({
  permission: 'job:manage',
  params: z.object({ id: z.uuid() }),
  body: jobStatusSchema,
  handler: async ({ ctx, actor, params, body }) =>
    ok(await staffChangeJobStatus({ ...ctx, actor: actor! }, params.id, body)),
});
