import { z } from 'zod';
import { startTwoFactorEnrollment, startTwoFactorEnrollmentWithSetupToken } from '@/domains/auth';
import { UnauthenticatedError } from '@/domains/shared/errors';
import { apiHandler, ok } from '@/domains/shared/http';

/**
 * POST /api/v1/account/2fa/enroll — confirm password, get QR code + backup codes.
 * Two ways in: a signed-in (possibly twoFactorPending) session, or — for a
 * 2FA-required account that has never enrolled and therefore holds no session
 * (audit H-02) — the short-lived `setupToken` login issued, together with the
 * password, which buys exactly the pending session enrolment needs.
 */
export const POST = apiHandler({
  auth: 'public',
  allowTwoFactorPending: true,
  body: z.object({ password: z.string().min(1).max(128), setupToken: z.string().max(512).optional() }),
  handler: async ({ ctx, actor, body, request }) => {
    if (actor) {
      return ok(
        await startTwoFactorEnrollment({ ...ctx, actor }, body.password, request.headers),
      );
    }
    if (!body.setupToken) {
      throw new UnauthenticatedError(
        'Sign in again to set up two-factor authentication.',
      );
    }
    const { enrollment, cookies } = await startTwoFactorEnrollmentWithSetupToken(
      ctx,
      body.setupToken,
      body.password,
      request.headers,
    );
    return { status: 200, data: enrollment, cookies };
  },
});
