import { getCurrentSessionId, listMySessions, sessionListSchema } from '@/domains/auth';
import { apiHandler, ok } from '@/domains/shared/http';

/** GET /api/v1/auth/sessions — the signed-in user's active sessions. */
export const GET = apiHandler({
  allowTwoFactorPending: true,
  output: sessionListSchema,
  handler: async ({ actor, request }) => {
    const currentSessionId = await getCurrentSessionId(request.headers);
    return ok({ sessions: await listMySessions(actor!.userId, currentSessionId) });
  },
});
