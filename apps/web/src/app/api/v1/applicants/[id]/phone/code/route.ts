import { requestPhoneChangeCodeSchema } from '@jobbank/shared';
import { z } from 'zod';
import { requestPhoneChangeCode } from '@/domains/applicant';
import { apiHandler, ok } from '@/domains/shared/http';

/**
 * POST /api/v1/applicants/{id}/phone/code — step 1 of the M-21 phone change:
 * text a 6-digit verification code to the NEW number. The change itself
 * (PUT /phone) only completes after that code is entered and verifies.
 */
export const POST = apiHandler({
  permission: 'applicant:manage',
  params: z.object({ id: z.uuid() }),
  body: requestPhoneChangeCodeSchema,
  handler: async ({ ctx, actor, params, body }) =>
    ok(await requestPhoneChangeCode({ ...ctx, actor: actor! }, params.id, body.phone)),
});
