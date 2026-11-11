import {
  APPLICANT_SORTABLE,
  applicantFilters,
  applicantStaffViewSchema,
  listApplicants,
  staffRegisterApplicant,
} from '@/domains/applicant';
import { apiHandler, created, ok } from '@/domains/shared/http';
import { parseListQuery } from '@/domains/shared/pagination';
import { staffRegisterApplicantSchema } from '@jobbank/shared';

/**
 * GET /api/v1/applicants — staff search, branch-scoped (?q name/CNIC/phone, status,
 * identityStatus, branchId, cityCode, areaCode, skillCode, sort, page).
 */
export const GET = apiHandler({
  permission: 'applicant:read',
  handler: async ({ actor, request }) => {
    const query = parseListQuery(new URL(request.url).searchParams, {
      sortable: APPLICANT_SORTABLE,
      defaultSort: { field: 'createdAt', direction: 'desc' },
      filters: applicantFilters,
    });
    const { data, meta } = await listApplicants(actor!, query);
    return ok(data, meta);
  },
});

/** POST /api/v1/applicants — staff creates an applicant account for their branch. */
export const POST = apiHandler({
  permission: 'applicant:manage',
  // Audit 2026-11-11 (M-22): a retry after a lost response used to return a
  // misleading 409 CNIC_TAKEN instead of the created profile.
  idempotent: true,
  body: staffRegisterApplicantSchema,
  output: applicantStaffViewSchema,
  handler: async ({ ctx, actor, body }) =>
    created(await staffRegisterApplicant({ ...ctx, actor: actor! }, body)),
});
