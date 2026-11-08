import { z } from 'zod';
import {
  listJobApplicantReferrals,
  referJobToApplicant,
  referJobToApplicantSchema,
} from '@/domains/job';
import { apiHandler, created, ok } from '@/domains/shared/http';

const paramsSchema = z.object({ id: z.uuid() });

/** GET /api/v1/jobs/[id]/applicant-referrals — applicants this job was referred to (staff). */
export const GET = apiHandler({
  permission: 'job:read',
  params: paramsSchema,
  handler: async ({ actor, params }) => ok(await listJobApplicantReferrals(actor!, params.id)),
});

/** POST /api/v1/jobs/[id]/applicant-referrals — staff refers this job to an applicant. */
export const POST = apiHandler({
  permission: 'job:refer',
  params: paramsSchema,
  body: referJobToApplicantSchema,
  handler: async ({ ctx, actor, params, body }) =>
    created(await referJobToApplicant({ ...ctx, actor: actor! }, params.id, body)),
});
