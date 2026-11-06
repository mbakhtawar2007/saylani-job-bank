import { z } from 'zod';
import { revokeMySession } from '@/domains/auth';
import { apiHandler, ok } from '@/domains/shared/http';

/**
 * DELETE /api/v1/auth/sessions/[id] — revoke one of my sessions.
 * Revoking the session in use signs me out; the UI redirects to /login.
 */
export const DELETE = apiHandler({
  allowTwoFactorPending: true,
  params: z.object({ id: z.uuid() }),
  handler: async ({ actor, ctx, params }) => {
    await revokeMySession(ctx, actor!.userId, params.id);
    return ok({ revoked: true });
  },
});
