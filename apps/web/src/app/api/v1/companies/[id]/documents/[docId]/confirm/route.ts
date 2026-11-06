import { confirmStaffCompanyDocument } from '@/domains/company';
import { apiHandler, ok } from '@/domains/shared/http';
import { z } from 'zod';

const params = z.object({ id: z.uuid(), docId: z.uuid() });

/** POST /api/v1/companies/{id}/documents/{docId}/confirm — staff step 2: confirm upload. */
export const POST = apiHandler({
  permission: 'company:onboard',
  params,
  handler: async ({ ctx, actor, params: p }) =>
    ok(await confirmStaffCompanyDocument({ ...ctx, actor: actor! }, p.id, p.docId)),
});
