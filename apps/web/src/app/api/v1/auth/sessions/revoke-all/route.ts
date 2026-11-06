import { revokeAllMySessions } from '@/domains/auth';
import { apiHandler, ok } from '@/domains/shared/http';

/**
 * POST /api/v1/auth/sessions/revoke-all — sign me out everywhere, including
 * this session. The UI redirects to /login afterwards.
 */
export const POST = apiHandler({
  allowTwoFactorPending: true,
  handler: async ({ actor, ctx }) => {
    await revokeAllMySessions(ctx, actor!.userId);
    return ok({ revoked: true });
  },
});
