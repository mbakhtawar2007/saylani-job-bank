/**
 * Removes personal data before anything is written to logs or the audit trail.
 * Matching is by key name (case-insensitive, ignoring _ and -), applied recursively.
 */

export const REDACTED = '[REDACTED]';

const SENSITIVE_KEYS = new Set(
  [
    // identity & contact
    'cnic',
    'nationalId',
    'passport',
    'phone',
    'mobile',
    'phoneNumber',
    'email',
    'dob',
    'dateOfBirth',
    'address',
    'addressLine',
    'addressLine1',
    'addressLine2',
    'street',
    // company identifiers & contacts (kept out of the audit trail)
    'ntn',
    'contactPhone',
    'contactEmail',
    // the outreach record lives in `company_onboarding` now; these keys must never
    // leak back into audit rows or logs via some other `after` payload
    'headOfficeAddress',
    // a whole nested address object (applicant permanent home address)
    'permanentAddress',
    // precise location (could locate an applicant's home)
    'lat',
    'lng',
    'latitude',
    'longitude',
    'location',
    'coordinates',
    // secrets
    'password',
    'passwordHash',
    'otp',
    'otpCode',
    'verificationCode',
    'token',
    'accessToken',
    'refreshToken',
    'secret',
    'apiKey',
    'authorization',
    'cookie',
    'setCookie',
  ].map(normalize),
);

function normalize(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, '');
}

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(normalize(key));
}

/** Deep copy of `value` with sensitive fields replaced. Handles cycles and Dates. */
export function redactPii<T>(value: T): T {
  const seen = new WeakMap<object, unknown>();

  const walk = (input: unknown): unknown => {
    if (input === null || typeof input !== 'object') return input;
    if (input instanceof Date) return input.toISOString();
    if (seen.has(input)) return '[Circular]';

    if (Array.isArray(input)) {
      const out: unknown[] = [];
      seen.set(input, out);
      for (const item of input) out.push(walk(item));
      return out;
    }

    const out: Record<string, unknown> = {};
    seen.set(input, out);
    for (const [key, val] of Object.entries(input)) {
      out[key] = isSensitiveKey(key) && val !== null && val !== undefined ? REDACTED : walk(val);
    }
    return out;
  };

  return walk(value) as T;
}
