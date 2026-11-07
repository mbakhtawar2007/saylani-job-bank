import { listReferralTargets } from '@/domains/job';
import { apiHandler, ok } from '@/domains/shared/http';

/** GET /api/v1/jobs/referral-targets — verified companies staff may refer jobs to. */
export const GET = apiHandler({
  permission: 'job:refer',
  handler: async ({ actor }) => ok(await listReferralTargets(actor!)),
});
