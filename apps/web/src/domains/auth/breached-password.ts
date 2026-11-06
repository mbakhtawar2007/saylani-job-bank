import 'server-only';
import { createHash } from 'node:crypto';
import { ValidationError } from '@/domains/shared/errors';
import { logger } from '@/lib/logger';

/**
 * Breached-password check via the Have I Been Pwned k-anonymity range API
 * (https://haveibeenpwned.com/API/v3#SearchingPwnedPasswordsByRange).
 *
 * Only the first 5 characters of the password's SHA-1 hash ever leave this
 * server: the API returns every suffix sharing that prefix, and the full hash
 * is compared locally. The full password — and the full hash — are never sent
 * anywhere, never logged, and never stored.
 *
 * FAIL-OPEN BY DESIGN: if HIBP is unreachable, slow, or returns something
 * unexpected, the check logs a warning and lets the password through. A
 * breach-database outage must never lock users out of setting or resetting
 * a password; the length/letter+number policy in passwordSchema still
 * applies. A breach check that cannot run is a lost signal, not a gate.
 */

const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range';
/** HIBP is a best-effort signal; never make a user wait on it. */
const HIBP_TIMEOUT_MS = 5_000;

type FetchFn = typeof fetch;

function sha1Hex(password: string): string {
  return createHash('sha1').update(password).digest('hex').toUpperCase();
}

/** True when the password's hash appears in a known breach. Fail-open: any error returns false. */
export async function isPasswordBreached(
  password: string,
  fetchImpl: FetchFn = fetch,
): Promise<boolean> {
  const hash = sha1Hex(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  try {
    const res = await fetchImpl(`${HIBP_RANGE_URL}/${prefix}`, {
      headers: { 'Add-Padding': 'true', 'User-Agent': 'saylani-job-bank' },
      signal: AbortSignal.timeout(HIBP_TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.warn('hibp range request failed', { status: res.status });
      return false;
    }
    const body = await res.text();
    // One `SUFFIX:count` line per breached hash sharing the prefix. Compare
    // locally; the suffix alone cannot be reversed into the password.
    return body.split('\n').some((line) => line.split(':')[0]?.trim() === suffix);
  } catch (err) {
    // Network failure, timeout, or an aborted request: fail open (see above).
    logger.warn('hibp breach check failed open', { err });
    return false;
  }
}

/**
 * Rejects a password found in a known breach. Call BEFORE the transaction
 * that sets the password — never inside it, so a slow HIBP response cannot
 * hold a database transaction open.
 */
export async function assertPasswordNotBreached(
  password: string,
  fetchImpl?: FetchFn,
): Promise<void> {
  if (await isPasswordBreached(password, fetchImpl)) {
    throw new ValidationError([
      {
        path: 'password',
        message:
          'This password has appeared in a data breach. Choose a different password that you have not used elsewhere.',
      },
    ]);
  }
}
