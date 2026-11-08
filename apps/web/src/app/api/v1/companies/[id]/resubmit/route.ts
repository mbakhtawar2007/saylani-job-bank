import { resubmitSchema } from '@jobbank/shared';
import { resubmitOnboardedCompany } from '@/domains/company';
import { apiHandler, ok } from '@/domains/shared/http';
import { z } from 'zod';

/** POST /api/v1/companies/{id}/resubmit — onboarder sends a field-visit company back after an info request. */
export const POST = apiHandler({
  permission: 'company:onboard',
  params: z.object({ id: z.uuid() }),
  body: resubmitSchema,
  handler: async ({ ctx, actor, params, body }) =>
    ok(await resubmitOnboardedCompany({ ...ctx, actor: actor! }, params.id, body)),
});
