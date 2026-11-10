import { z } from 'zod';
import { ensureApplicantVerificationToken } from '@/domains/applicant';
import { apiHandler, ok } from '@/domains/shared/http';

export const POST = apiHandler({
  permission: 'applicant:manage',
  params: z.object({ id: z.uuid() }),
  handler: async ({ ctx, actor, params }) => {
    await ensureApplicantVerificationToken({ ...ctx, actor: actor! }, params.id, true);
    return ok({ regenerated: true });
  },
});
