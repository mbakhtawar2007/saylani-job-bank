import { createHash } from 'node:crypto';
import { z } from 'zod';
import { previewInvitation } from '@/domains/auth';
import { apiHandler, ok } from '@/domains/shared/http';
import { enforceRateLimit, enforceRateLimitByIp } from '@/domains/shared/rate-limit';

/**
 * GET /api/v1/auth/invitations/lookup?token= — who the invitation is for (does not use it up).
 *
 * Rate-limited like the other auth endpoints: the lookup is an oracle for
 * token validity (a valid token returns a name and email, an invalid one a
 * 400), so it must not be enumerable at will. Per-IP 30/15m, plus per-token
 * 10/15m keyed on the token's SHA-256 hash (the raw token is never used as
 * a rate-limit subject).
 */
export const GET = apiHandler({
  auth: 'public',
  query: z.object({ token: z.string().min(20).max(200) }),
  handler: async ({ ctx, query }) => {
    await enforceRateLimitByIp(ctx.ip, 'invite-lookup-ip', { limit: 30, windowSeconds: 900 });
    await enforceRateLimit(
      'invite-lookup-token',
      createHash('sha256').update(query.token).digest('hex'),
      { limit: 10, windowSeconds: 900 },
    );
    return ok(await previewInvitation(query.token));
  },
});

/**
 * POST /api/v1/auth/invitations/lookup — same lookup, token in the JSON body.
 *
 * Audit 2026-11-11 (L-18): the GET email link stays (a link from email must
 * be a GET), but non-email callers should not have to put a token in a URL —
 * URLs land in browser history, Referer headers and proxy logs. Same
 * validation, same per-IP + per-token (SHA-256 of the token, never the raw
 * token) rate limits as GET. The token is never logged on either path:
 * previewInvitation does not log, and 'token' is in the log redaction list
 * (lib/privacy/redact.ts).
 */
export const POST = apiHandler({
  auth: 'public',
  body: z.object({ token: z.string().min(20).max(200) }),
  handler: async ({ ctx, body }) => {
    await enforceRateLimitByIp(ctx.ip, 'invite-lookup-ip', { limit: 30, windowSeconds: 900 });
    await enforceRateLimit(
      'invite-lookup-token',
      createHash('sha256').update(body.token).digest('hex'),
      { limit: 10, windowSeconds: 900 },
    );
    return ok(await previewInvitation(body.token));
  },
});
