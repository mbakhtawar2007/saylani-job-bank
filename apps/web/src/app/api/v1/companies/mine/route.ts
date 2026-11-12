import { z } from 'zod';
import { companyViewSchema, listMyCompanies } from '@/domains/company';
import { apiHandler, ok } from '@/domains/shared/http';

/** GET /api/v1/companies/mine — every company the signed-in employer belongs to (max 2). */
export const GET = apiHandler({
  permission: 'company:register',
  output: z.array(companyViewSchema),
  handler: async ({ actor }) => ok(await listMyCompanies(actor!)),
});
