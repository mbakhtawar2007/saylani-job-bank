import { assistedApplicantRegistrationSchema } from '@jobbank/shared';
import { registerApplicantForStaff } from '@/domains/applicant';
import { apiHandler, created } from '@/domains/shared/http';

/** POST /api/v1/applicants/staff-register — create an applicant for an assisted registration. */
export const POST = apiHandler({
  permission: 'applicant:create',
  body: assistedApplicantRegistrationSchema,
  idempotent: true,
  handler: async ({ ctx, actor, body }) =>
    created(await registerApplicantForStaff({ ...ctx, actor: actor! }, body), '/api/v1/applicants'),
});
