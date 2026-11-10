import { staffApplicantProfileUpdateSchema } from '@jobbank/shared';
import { z } from 'zod';
import { staffUpdateApplicantProfile } from '@/domains/applicant';
import { apiHandler, ok } from '@/domains/shared/http';

/** PATCH /api/v1/applicants/{id}/profile — update the existing staff-managed profile. */
export const PATCH = apiHandler({
  permission: 'applicant:manage',
  params: z.object({ id: z.uuid() }),
  body: staffApplicantProfileUpdateSchema,
  handler: async ({ ctx, actor, params, body }) =>
    ok(await staffUpdateApplicantProfile({ ...ctx, actor: actor! }, params.id, body)),
});
