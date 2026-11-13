import { confirmStaffApplicantPhoto } from '@/domains/applicant';
import { apiHandler, ok } from '@/domains/shared/http';
import { z } from 'zod';

const params = z.object({ id: z.uuid(), docId: z.uuid() });

/** POST /api/v1/applicants/{id}/documents/{docId}/confirm — staff photo step 2: confirm upload. */
export const POST = apiHandler({
  permission: 'applicant:create',
  params,
  handler: async ({ ctx, actor, params: p }) =>
    ok(await confirmStaffApplicantPhoto({ ...ctx, actor: actor! }, p.id, p.docId)),
});
