import 'server-only';
import { env } from '@/lib/env';

/**
 * Signs sessions and keys OTP hashes. There is no fallback secret: the app refuses to
 * start without a real one, in every environment. A forgotten NODE_ENV must never
 * silently put a deployment on a publicly known secret.
 */
export function getAuthSecret(): string {
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'BETTER_AUTH_SECRET must be set to at least 32 random characters ' +
        '(generate with: openssl rand -base64 32) — see .env.example. ' +
        'Sessions and OTP hashes cannot be signed without it.',
    );
  }
  return secret;
}
