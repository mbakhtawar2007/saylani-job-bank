import { COMPANY_SORTABLE, companyFilters, listCompanies } from '@/domains/company';
import { apiHandler, ok } from '@/domains/shared/http';
import { parseListQuery } from '@/domains/shared/pagination';

/** GET /api/v1/companies — branch-scoped company list (Branch Admin: verified only; Super Admin: all). */
export const GET = apiHandler({
  permission: 'company:read',
  handler: async ({ actor, request }) => {
    const query = parseListQuery(new URL(request.url).searchParams, {
      sortable: [...COMPANY_SORTABLE],
      defaultSort: { field: 'legalName', direction: 'asc' },
      filters: companyFilters,
    });
    return ok(await listCompanies(actor!, query));
  },
});

/*
 * No POST here (F9/N16, 2026-11-08): the legacy staffRegisterCompany path —
 * a bare DRAFT with no outreach record, no Review & Print and no
 * verified-signed flow — is deleted with the branch-admin "Add company"
 * page. Companies are registered only via POST /api/v1/companies/onboard
 * (field-visit flow, company:onboard) or POST /api/v1/companies/register
 * (employer self-registration).
 */
