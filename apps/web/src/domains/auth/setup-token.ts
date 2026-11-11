import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { schema } from '@jobbank/db';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { loadActor, requiresTwoFactor } from './actor';
import { getAuthSecret } from './secret';

/**
 * Short-lived, non-session challenge for 2FA enrolment (audit 2026-11-11,
 * H-02). A Super/Branch Admin who has never enrolled 2FA must NOT get a
 * session at login — instead login returns this token, usable only to start
 * enrolment (POST /api/v1/account/2fa/enroll with `setupToken`). The token
 * proves the holder just passed the password check; it is NOT a session and
 * cannot call any other route.
 *
 * Format: `v1.<userId>.<expiryEpochSeconds>.<hmacHex>`, where the HMAC is
 * over `2fa-setup:v1:<userId>:<expiry>` with BETTER_AUTH_SECRET. The token
 * is single-purpose: verification also re-checks that the user still
 * requires 2FA and has still not enrolled, so it becomes useless the moment
 * enrolment completes (or the role changes).
 */
export const TWO_FACTOR_SETUP_TTL_SECONDS = 900; // 15 minutes

export function createTwoFactorSetupToken(userId: string): {
  token: string;
  expiresInSeconds: number;
} {
  const expiry = Math.floor(Date.now() / 1000) + TWO_FACTOR_SETUP_TTL_SECONDS;
  const payload = `2fa-setup:v1:${userId}:${expiry}`;
  const signature = createHmac('sha256', getAuthSecret()).update(payload).digest('hex');
  return { token: `v1.${userId}.${expiry}.${signature}`, expiresInSeconds: TWO_FACTOR_SETUP_TTL_SECONDS };
}

/** Returns the userId if the token is valid and still usable, else null. */
export async function verifyTwoFactorSetupToken(token: string): Promise<string | null> {
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  const [, userId, expiryRaw, signature] = parts;
  if (!userId || !expiryRaw || !signature) return null;
  const expiry = Number(expiryRaw);
  if (!Number.isInteger(expiry) || expiry * 1000 <= Date.now()) return null;
  const expected = createHmac('sha256', getAuthSecret())
    .update(`2fa-setup:v1:${userId}:${expiry}`)
    .digest('hex');
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  // The token dies once its purpose is served: if the user enrolled (or no
  // longer requires 2FA), the setup link must not work again.
  const [row] = await db
    .select({ twoFactorEnabled: schema.users.twoFactorEnabled })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!row || row.twoFactorEnabled) return null;
  const actor = await loadActor(userId);
  if (!requiresTwoFactor(actor.roles)) return null;
  return userId;
}
