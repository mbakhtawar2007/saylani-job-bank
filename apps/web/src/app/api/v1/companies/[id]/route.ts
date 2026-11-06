import { correctCompanySchema } from '@jobbank/shared';
import { companyViewSchema, correctCompanyDetails, getCompanyDetail } from '@/domains/company';
import { apiHandler, ok } from '@/domains/shared/http';
import { z } from 'zod';

const params = z.object({ id: z.uuid() });

/** GET /api/v1/companies/{id} — staff/admin company detail. */
export const GET = apiHandler({
  permission: 'company:read',
  params,
  output: companyViewSchema,
  handler: async ({ actor, params: p }) => ok(await getCompanyDetail(actor!, p.id)),
});

/** PATCH /api/v1/companies/{id} — Super Admin corrects locked company details. */
export const PATCH = apiHandler({
  permission: 'company:manage',
  params,
  body: correctCompanySchema,
  output: companyViewSchema,
  handler: async ({ ctx, actor, params: p, body }) =>
    ok(await correctCompanyDetails({ ...ctx, actor: actor! }, p.id, body)),
});
