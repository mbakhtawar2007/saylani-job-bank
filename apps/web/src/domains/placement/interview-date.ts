import { z } from 'zod';
import { ValidationError } from '@/domains/shared/errors';

/**
 * H11 — interviews must be in the future. A few minutes' grace covers clock
 * skew between the client, the server, and the applicant's device.
 *
 * Lives in its own module (not placement/index.ts) so both the staff-side
 * and employer-side schemas can use it: placement/index.ts re-exports
 * placement/employer.ts, so a const defined in index.ts would still be in
 * its temporal dead zone when employer.ts evaluates first.
 */
export const INTERVIEW_AT_GRACE_MS = 5 * 60_000;

export function assertFutureInterviewAt(value: string | Date): void {
  const at = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(at.getTime()) || at.getTime() <= Date.now() - INTERVIEW_AT_GRACE_MS) {
    throw new ValidationError([
      { path: 'interviewAt', message: 'Interview time must be in the future' },
    ]);
  }
}

export const futureInterviewAtSchema = z
  .string()
  .datetime()
  .refine((v) => new Date(v).getTime() > Date.now() - INTERVIEW_AT_GRACE_MS, {
    message: 'Interview time must be in the future',
  });
