import { onboardedCompanySchema, staffOnboardCompany } from '@/domains/company';
import { apiHandler, created } from '@/domains/shared/http';
import { staffOnboardCompanySchema } from '@jobbank/shared';

/** POST /api/v1/companies/onboard — Staff / Branch Admin / Super Admin / Verifier onboard a company after a field visit. */
export const POST = apiHandler({
  permission: 'company:onboard',
  // L10 (extra, same class as correct-details/status): the sidebar dialog
  // posts this on submit, and a double-click used to create two DRAFT rows
  // for one NTN before the F4 resumption. A key per submit closes that too.
  idempotent: true,
  body: staffOnboardCompanySchema,
  output: onboardedCompanySchema,
  handler: async ({ ctx, actor, body }) => {
    const company = await staffOnboardCompany({ ...ctx, actor: actor! }, body);
    return created(company);
  },
});
