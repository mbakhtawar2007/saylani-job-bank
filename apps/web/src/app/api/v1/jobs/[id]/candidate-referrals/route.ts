import { z } from 'zod';
import {
  listReferredCandidatesForJob,
  referApplicantToEmployerForJob,
  referApplicantToEmployerForJobSchema,
} from '@/domains/placement';
import { apiHandler, created, ok } from '@/domains/shared/http';

const paramsSchema = z.object({ id: z.uuid() });

/** GET /api/v1/jobs/[id]/candidate-referrals — candidates already referred to the employer for this job (staff). */
export const GET = apiHandler({
  permission: 'match_case:read',
  params: paramsSchema,
  handler: async ({ actor, params }) => ok(await listReferredCandidatesForJob(actor!, params.id)),
});

/** POST /api/v1/jobs/[id]/candidate-referrals — staff refers an applicant to the employer for this job, in one step. */
export const POST = apiHandler({
  permission: 'match_case:refer',
  params: paramsSchema,
  body: referApplicantToEmployerForJobSchema,
  handler: async ({ ctx, actor, params, body }) =>
    created(await referApplicantToEmployerForJob({ ...ctx, actor: actor! }, params.id, body)),
});
