import { staffOnboardCompany } from '@/domains/company';
import { apiHandler, created } from '@/domains/shared/http';
import { staffOnboardCompanySchema } from '@jobbank/shared';

/** POST /api/v1/companies/onboard — Staff / Branch Admin / Super Admin onboard a company after a field visit. */
export const POST = apiHandler({
  permission: 'company:onboard',
  body: staffOnboardCompanySchema,
  handler: async ({ ctx, actor, body }) => {
    const company = await staffOnboardCompany({ ...ctx, actor: actor! }, body);
    return created(company);
  },
});
