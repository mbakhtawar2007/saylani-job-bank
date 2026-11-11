import { z } from 'zod';
import { loginWithPassword } from '@/domains/auth';
import { apiHandler } from '@/domains/shared/http';

/**
 * POST /api/v1/auth/login — staff and employers sign in with email + password.
 * If the account has two-factor on, responds `{ kind: 'two_factor_required' }` and the
 * client continues at /api/v1/auth/2fa/verify. If the role requires two-factor but
 * none is enrolled, responds `{ kind: 'two_factor_setup_required' }` with a
 * short-lived setup token instead of a session (audit H-02) — no session is
 * issued until enrolment completes.
 */
export const POST = apiHandler({
  auth: 'public',
  allowTwoFactorPending: true,
  body: z.object({ email: z.email().max(254), password: z.string().min(1).max(128) }),
  handler: async ({ ctx, body, request }) => {
    const { cookies, ...result } = await loginWithPassword(
      ctx,
      body.email,
      body.password,
      request.headers,
    );
    return { status: 200, data: result, cookies };
  },
});
