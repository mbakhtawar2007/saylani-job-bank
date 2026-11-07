import { z } from 'zod';
import { listJobReferrals, referJobSchema, referJobToEmployer } from '@/domains/job';
import { apiHandler, created, ok } from '@/domains/shared/http';

const paramsSchema = z.object({ id: z.uuid() });

/** GET /api/v1/jobs/[id]/referrals — employers this job has been referred to (staff). */
export const GET = apiHandler({
  permission: 'job:read',
  params: paramsSchema,
  handler: async ({ actor, params }) => ok(await listJobReferrals(actor!, params.id)),
});

/** POST /api/v1/jobs/[id]/referrals — staff refers this job to an employer company. */
export const POST = apiHandler({
  permission: 'job:refer',
  params: paramsSchema,
  body: referJobSchema,
  handler: async ({ ctx, actor, params, body }) =>
    created(await referJobToEmployer({ ...ctx, actor: actor! }, params.id, body)),
});
