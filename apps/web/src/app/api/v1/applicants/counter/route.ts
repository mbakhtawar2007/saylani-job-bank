import { counterRegisterSchema } from '@jobbank/shared';
import { registerApplicantAtCounter } from '@/domains/applicant';
import { apiHandler, created } from '@/domains/shared/http';

/**
 * POST /api/v1/applicants/counter — staff register a candidate at a counter (no login
 * is created). A separate path from POST /api/v1/applicants on purpose: that route
 * creates a staff-registered applicant account (Rafeh's staff-assisted flow), while
 * this one is only for walk-ins without smartphones. It never issues a token and
 * never replaces the token-only first step.
 */
export const POST = apiHandler({
  permission: 'applicant:manage',
  idempotent: true,
  body: counterRegisterSchema,
  handler: async ({ ctx, actor, body }) =>
    created(await registerApplicantAtCounter({ ...ctx, actor: actor! }, body)),
});
