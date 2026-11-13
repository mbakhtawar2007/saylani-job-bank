import type { ApiError, ErrorCode, FieldIssue } from '@jobbank/shared';
import { ZodError } from 'zod';
import {
  DomainError,
  RateLimitedError,
  ValidationError,
  fieldLabel,
  validationMessage,
} from './errors';

export interface ErrorResponse {
  status: number;
  body: ApiError;
  headers?: Record<string, string>;
  /** True for unexpected errors that must be logged with a stack trace. */
  unexpected: boolean;
}

export function zodIssues(error: ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.') || '(root)',
    message: issue.message,
  }));
}

/** Postgres SQLSTATEs we translate into meaningful API errors. */
const PG_ERRORS: Record<string, { code: ErrorCode; status: number }> = {
  '23505': { code: 'CONFLICT', status: 409 },
  '23503': { code: 'CONFLICT', status: 409 },
  '23514': { code: 'VALIDATION_FAILED', status: 422 },
  /** Numeric value out of range (e.g. a salary that overflows Postgres `integer`) — S1. */
  '22003': { code: 'VALIDATION_FAILED', status: 422 },
  JB001: { code: 'APPEND_ONLY_VIOLATION', status: 409 },
};

function pgCode(error: unknown): string | undefined {
  // drizzle wraps driver errors; the SQLSTATE lives on the error or its cause.
  for (let current: unknown = error, depth = 0; current && depth < 4; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/**
 * The column a Postgres error names, from its `detail` ("Key (email)=(…) already
 * exists"). Only the column name is ever used — the value in the detail is
 * never copied into a message, so no user data leaks into an error.
 */
function pgField(error: unknown): string | undefined {
  for (let current: unknown = error, depth = 0; current && depth < 4; depth += 1) {
    const detail = (current as { detail?: unknown }).detail;
    if (typeof detail === 'string') {
      const match = /Key \(([^)]+)\)/.exec(detail);
      const column = match?.[1]?.split(',')[0]?.trim();
      if (column) return fieldLabel(column).toLowerCase();
    }
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/** Message for a mapped Postgres error, naming the field when it is known. */
function pgMessage(code: string, field: string | undefined): string {
  switch (code) {
    case '23505':
      return field
        ? `A record with this ${field} already exists — use a different ${field}, or open the existing record.`
        : 'A record with these details already exists — use different details, or open the existing record.';
    case '23503':
      return field
        ? `The ${field} you selected does not exist — choose an existing ${field} and try again.`
        : 'A related record does not exist or is still in use — check it still exists and try again.';
    case '23514':
      return 'The data breaks a validation rule — check the highlighted fields and try again.';
    case '22003':
      return 'A number is too large — reduce it to fit the allowed range and try again.';
    case 'JB001':
      return 'This record is permanent and cannot be changed';
    default:
      return 'The database rejected this change — check the highlighted fields and try again.';
  }
}

/** Maps any thrown value to the PRD §8 error envelope. Never leaks internals for 5xx. */
export function toErrorResponse(error: unknown, correlationId: string): ErrorResponse {
  const envelope = (
    code: ErrorCode,
    message: string,
    extra: Partial<ApiError['error']> = {},
  ): ApiError => ({
    error: { code, message, ...extra, correlation_id: correlationId },
  });

  if (error instanceof ValidationError) {
    return {
      status: 422,
      body: envelope(error.code, error.message, { issues: error.issues }),
      unexpected: false,
    };
  }
  if (error instanceof ZodError) {
    const issues = zodIssues(error);
    return {
      status: 422,
      body: envelope('VALIDATION_FAILED', validationMessage(issues), { issues }),
      unexpected: false,
    };
  }
  if (error instanceof DomainError) {
    return {
      status: error.status,
      body: envelope(
        error.code,
        error.message,
        error.details !== undefined ? { details: error.details } : {},
      ),
      headers:
        error instanceof RateLimitedError
          ? { 'retry-after': String(error.retryAfterSeconds) }
          : undefined,
      unexpected: false,
    };
  }

  const mapped = pgCode(error);
  if (mapped && PG_ERRORS[mapped]) {
    const { code, status } = PG_ERRORS[mapped];
    return { status, body: envelope(code, pgMessage(mapped, pgField(error))), unexpected: false };
  }

  return {
    status: 500,
    body: envelope('INTERNAL', 'Something went wrong on our side. Please try again.'),
    unexpected: true,
  };
}
