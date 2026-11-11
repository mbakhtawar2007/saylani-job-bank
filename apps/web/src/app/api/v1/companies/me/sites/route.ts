import { companySiteSchema } from '@jobbank/shared';
import { addMySite } from '@/domains/company';
import { apiHandler, created } from '@/domains/shared/http';

/** POST /api/v1/companies/me/sites — add a new work site. */
export const POST = apiHandler({
  permission: 'company:register',
  // Audit 2026-11-11 (M-26): same gap as POST /jobs/me — a double-submit
  // could create a duplicate site (only the 20-site cap bounded it).
  idempotent: true,
  body: companySiteSchema,
  handler: async ({ ctx, actor, body }) =>
    created(await addMySite({ ...ctx, actor: actor! }, body), '/api/v1/companies/me'),
});
