import { z } from 'zod';
import { confirmRegistrationToken } from '@/domains/applicant';
import { apiHandler, ok } from '@/domains/shared/http';

const tokenSchema = z.object({ token: z.string().trim().min(1).max(64) });

export const POST = apiHandler({
  roles: ['STAFF', 'BRANCH_ADMIN'],
  permission: 'applicant:manage',
  body: tokenSchema,
  handler: async ({ ctx, actor, body }) =>
    ok(await confirmRegistrationToken({ ...ctx, actor: actor! }, body.token)),
});
