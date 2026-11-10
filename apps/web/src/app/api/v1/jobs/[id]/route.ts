import { z } from 'zod';
import { getJobDetail, staffUpdateJob } from '@/domains/job';
import { apiHandler, ok } from '@/domains/shared/http';
import { updateJobSchema } from '@jobbank/shared';

/** GET /api/v1/jobs/[id] — job detail for staff. */
export const GET = apiHandler({
  permission: 'job:read',
  params: z.object({ id: z.uuid() }),
  handler: async ({ actor, params }) => ok(await getJobDetail(actor!, params.id)),
});

/** PATCH /api/v1/jobs/[id] — staff edits a branch-owned vacancy. */
export const PATCH = apiHandler({
  permission: 'job:manage',
  params: z.object({ id: z.uuid() }),
  body: updateJobSchema,
  handler: async ({ ctx, actor, params, body }) =>
    ok(await staffUpdateJob({ ...ctx, actor: actor! }, params.id, body)),
});
