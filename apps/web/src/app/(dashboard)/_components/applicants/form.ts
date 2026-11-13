import type { FieldIssue } from '@jobbank/shared';
import type { ZodError } from 'zod';
import { friendlyApiError } from '@/lib/api/client';

export type FieldErrors = Record<string, string>;

/** First message per field path ("items.0.skillCode"), from zod or from the API. */
export function toFieldErrors(issues: readonly FieldIssue[]): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of issues) out[issue.path] ??= issue.message;
  return out;
}

export function zodFieldErrors(error: ZodError): FieldErrors {
  return toFieldErrors(
    error.issues.map((i) => ({
      path: i.path.map(String).join('.') || '(root)',
      message: i.message,
    })),
  );
}

/**
 * One shared message for a failed API call: with 422 issues, list them
 * field by field; otherwise the server message. Never the bare
 * "Something went wrong" when the server said more.
 */
export const errorMessage = (err: unknown) => friendlyApiError(err);
