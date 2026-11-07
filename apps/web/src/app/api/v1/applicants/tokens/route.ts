import { issueApplicantToken } from '@/domains/applicant';
import { apiHandler, created } from '@/domains/shared/http';
import { applicantTokenSchema, issueApplicantTokenSchema } from '@jobbank/shared';

/**
 * POST /api/v1/applicants/tokens — first counter issues a numbered token for
 * the day from a CNIC + name only (2026-11-07 token-only first step). Same
 * CNIC, same branch, same day returns the token already issued.
 */
export const POST = apiHandler({
  permission: 'applicant:manage',
  body: issueApplicantTokenSchema,
  output: applicantTokenSchema,
  handler: async ({ ctx, actor, body }) =>
    created(await issueApplicantToken({ ...ctx, actor: actor! }, body)),
});
