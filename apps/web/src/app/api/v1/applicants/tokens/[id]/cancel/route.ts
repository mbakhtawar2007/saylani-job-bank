import { z } from 'zod';
import { cancelApplicantToken } from '@/domains/applicant';
import { apiHandler, ok } from '@/domains/shared/http';
import { applicantTokenSchema, cancelApplicantTokenSchema } from '@jobbank/shared';

/**
 * POST /api/v1/applicants/tokens/{id}/cancel — cancel an ISSUED token (N5).
 * A cancelled token does not block a new token for the same CNIC the same day;
 * a COMPLETED token can never be cancelled.
 */
export const POST = apiHandler({
  permission: 'applicant:manage',
  params: z.object({ id: z.uuid() }),
  body: cancelApplicantTokenSchema.optional(),
  output: applicantTokenSchema,
  handler: async ({ ctx, actor, params, body }) =>
    ok(await cancelApplicantToken({ ...ctx, actor: actor! }, params.id, body ?? {})),
});
