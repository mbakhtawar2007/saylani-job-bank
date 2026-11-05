import { z } from 'zod';
import { lookupRegistrationToken } from '@/domains/applicant';
import { apiHandler, ok } from '@/domains/shared/http';

const tokenSchema = z.object({ token: z.string().trim().min(1).max(64) });

export const POST = apiHandler({
  roles: ['STAFF', 'BRANCH_ADMIN'],
  permission: 'applicant:read',
  body: tokenSchema,
  handler: async ({ actor, body }) => ok(await lookupRegistrationToken(actor!, body.token)),
});
