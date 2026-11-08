import { describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, ValidationError } from '@/domains/shared/errors';
import {
  assertFutureInterviewAt,
  scheduleInterviewSchema,
  updateInterviewStatusSchema,
} from './index';
import {
  EMPLOYER_DECIDABLE_STATUSES,
  EMPLOYER_VISIBLE_STATUSES,
  assertEmployerCanDecide,
  assertEmployerCanView,
  recordEmployerDecisionSchema,
  refuseJobOfferSchema,
  scheduleEmployerInterviewSchema,
  updateEmployerInterviewStatusSchema,
} from './employer';

// H11 — interviews must be in the future (5-minute grace for clock skew).
// Pure schema/helper checks; no DB needed.
describe('H11 future interview dates', () => {
  const past = new Date(Date.now() - 60 * 60_000).toISOString();
  const future = new Date(Date.now() + 60 * 60_000).toISOString();
  const justNow = new Date(Date.now() - 60_000).toISOString();

  it('staff schedule schema rejects a past interviewAt', () => {
    expect(scheduleInterviewSchema.safeParse({ interviewAt: past }).success).toBe(false);
    expect(scheduleInterviewSchema.safeParse({ interviewAt: future }).success).toBe(true);
  });

  it('staff update schema rejects a past interviewAt when one is supplied', () => {
    expect(
      updateInterviewStatusSchema.safeParse({ status: 'INTERVIEW_SCHEDULED', interviewAt: past })
        .success,
    ).toBe(false);
    expect(
      updateInterviewStatusSchema.safeParse({
        status: 'INTERVIEW_POSTPONED',
        interviewAt: future,
      }).success,
    ).toBe(true);
  });

  it('employer schedule schema rejects a past interviewAt', () => {
    expect(scheduleEmployerInterviewSchema.safeParse({ interviewAt: past }).success).toBe(false);
    expect(scheduleEmployerInterviewSchema.safeParse({ interviewAt: future }).success).toBe(true);
  });

  it('employer update schema rejects a past interviewAt when one is supplied', () => {
    expect(
      updateEmployerInterviewStatusSchema.safeParse({
        status: 'EMPLOYER_INTERVIEW_SCHEDULED',
        interviewAt: past,
      }).success,
    ).toBe(false);
  });

  it('a date a minute ago passes (clock-skew grace)', () => {
    expect(scheduleInterviewSchema.safeParse({ interviewAt: justNow }).success).toBe(true);
  });

  it('assertFutureInterviewAt throws on the past and accepts the future', () => {
    try {
      assertFutureInterviewAt(past);
      expect.unreachable('past date should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).issues[0]?.message).toContain('in the future');
    }
    expect(() => assertFutureInterviewAt(future)).not.toThrow();
    expect(() => assertFutureInterviewAt(new Date(Date.now() + 10_000))).not.toThrow();
  });
});

// H17 + H18 — employer decisions and visibility guards (pure helpers).
describe('H17/H18 employer decision + visibility guards', () => {
  it('decidable states are FORWARDED, employer interview states, and ON_HOLD', () => {
    expect([...EMPLOYER_DECIDABLE_STATUSES].sort()).toEqual(
      [
        'EMPLOYER_INTERVIEW_CANCELLED',
        'EMPLOYER_INTERVIEW_POSTPONED',
        'EMPLOYER_INTERVIEW_SCHEDULED',
        'FORWARDED',
        'ON_HOLD',
      ].sort(),
    );
  });

  it('terminal states and SHORTLISTED cannot be decided', () => {
    for (const status of [
      'HIRED',
      'EMPLOYER_REJECTED',
      'APPLICANT_REFUSED',
      'REJECTED',
      'SHORTLISTED',
    ] as const) {
      expect(() => assertEmployerCanDecide(status)).toThrow(ForbiddenError);
    }
    expect(() => assertEmployerCanDecide('FORWARDED')).not.toThrow();
    expect(() => assertEmployerCanDecide('ON_HOLD')).not.toThrow();
  });

  it('pre-referral states are invisible to employers', () => {
    for (const status of [
      'SHORTLISTED',
      'INTERVIEW_SCHEDULED',
      'INTERVIEW_POSTPONED',
      'INTERVIEW_CANCELLED',
      'REJECTED',
    ] as const) {
      expect(() => assertEmployerCanView(status, 'app-1')).toThrow(NotFoundError);
    }
    expect(EMPLOYER_VISIBLE_STATUSES).toContain('FORWARDED');
    expect(() => assertEmployerCanView('FORWARDED', 'app-1')).not.toThrow();
    expect(() => assertEmployerCanView('HIRED', 'app-1')).not.toThrow();
  });
});

// M19 + H19 — decision notes, reschedule dates, refusal reason codes.
describe('M19/H19 decision + reschedule + refusal guards', () => {
  const future = new Date(Date.now() + 60 * 60_000).toISOString();

  it('REJECTED employer decisions need a note of at least 5 characters', () => {
    expect(recordEmployerDecisionSchema.safeParse({ decision: 'REJECTED' }).success).toBe(false);
    expect(
      recordEmployerDecisionSchema.safeParse({ decision: 'REJECTED', note: 'no' }).success,
    ).toBe(false);
    expect(
      recordEmployerDecisionSchema.safeParse({ decision: 'REJECTED', note: 'Not a fit' }).success,
    ).toBe(true);
    expect(recordEmployerDecisionSchema.safeParse({ decision: 'HOLD' }).success).toBe(true);
    expect(recordEmployerDecisionSchema.safeParse({ decision: 'ACCEPTED' }).success).toBe(true);
  });

  it('rescheduling back to SCHEDULED requires a new interviewAt (staff + employer)', () => {
    expect(updateInterviewStatusSchema.safeParse({ status: 'INTERVIEW_SCHEDULED' }).success).toBe(
      false,
    );
    expect(
      updateInterviewStatusSchema.safeParse({ status: 'INTERVIEW_SCHEDULED', interviewAt: future })
        .success,
    ).toBe(true);
    expect(updateInterviewStatusSchema.safeParse({ status: 'INTERVIEW_POSTPONED' }).success).toBe(
      true,
    );
    expect(
      updateEmployerInterviewStatusSchema.safeParse({ status: 'EMPLOYER_INTERVIEW_SCHEDULED' })
        .success,
    ).toBe(false);
    expect(
      updateEmployerInterviewStatusSchema.safeParse({
        status: 'EMPLOYER_INTERVIEW_SCHEDULED',
        interviewAt: future,
      }).success,
    ).toBe(true);
  });

  it('refusing an offer needs a REFUSAL_REASON code, not free text', () => {
    expect(refuseJobOfferSchema.safeParse({ reasonCode: 'LOW_SALARY' }).success).toBe(true);
    expect(refuseJobOfferSchema.safeParse({ reason: 'Salary is too low' }).success).toBe(false);
    expect(refuseJobOfferSchema.safeParse({}).success).toBe(false);
  });
});
