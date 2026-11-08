import { onboardedCompanyHeadOfficeSchema } from '@jobbank/shared';
import { setOnboardedCompanyHeadOffice } from '@/domains/company';
import { apiHandler, ok } from '@/domains/shared/http';
import { z } from 'zod';

/** POST /api/v1/companies/{id}/head-office — onboarder sets the head office of a field-visit company. */
export const POST = apiHandler({
  permission: 'company:onboard',
  params: z.object({ id: z.uuid() }),
  body: onboardedCompanyHeadOfficeSchema,
  handler: async ({ ctx, actor, params, body }) =>
    ok(await setOnboardedCompanyHeadOffice({ ...ctx, actor: actor! }, params.id, body)),
});
