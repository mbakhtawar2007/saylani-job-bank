import { env } from '@/lib/env';

/**
 * The caller's IP for rate limits and audit logs. Each proxy appends the address it
 * received from to X-Forwarded-For, so only the right-hand entries are trustworthy;
 * anything further left may be written by the client.
 *
 * TRUSTED_PROXY_HOPS is how many proxies sit in front of the app (default 1).
 * - chain longer than hops: the client is `chain[chain.length - hops]`.
 * - chain shorter than hops: null. The entries present cannot be attributed to a
 *   known proxy, so trusting the leftmost one would hand the client its own IP
 *   bucket. Callers must treat null as "no trustworthy IP" (fail closed).
 * - empty chain: null. `X-Real-IP` is never trusted — any direct client can set it.
 */
export function clientIpFrom(
  headers: Headers,
  hops: number = env.TRUSTED_PROXY_HOPS,
): string | null {
  const trustedHops = Number.isInteger(hops) && hops > 0 ? hops : 1;
  const chain = (headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (chain.length < trustedHops) return null;
  return chain[chain.length - trustedHops] ?? null;
}
