import { describe, expect, it } from 'vitest';
import { ForbiddenError, InvalidTransitionError } from '@/domains/shared/errors';
import { companyMachine, READY } from './machine';

/**
 * Audit round 2: H20 (Super Admin suspend/reinstate) and M24 (no REJECT
 * from INFO_REQUESTED). Pure machine checks — no DB.
 */
describe('companyMachine (audit H20, M24)', () => {
  it('M24: REJECT is allowed from UNDER_VERIFICATION and RESUBMITTED', () => {
    expect(companyMachine.transition('UNDER_VERIFICATION', 'REJECT', READY, ['VERIFIER'])).toBe(
      'REJECTED',
    );
    expect(companyMachine.transition('RESUBMITTED', 'REJECT', READY, ['VERIFIER'])).toBe(
      'REJECTED',
    );
  });

  it('M24: REJECT from INFO_REQUESTED is not a transition', () => {
    expect(() =>
      companyMachine.transition('INFO_REQUESTED', 'REJECT', READY, ['VERIFIER']),
    ).toThrow(InvalidTransitionError);
  });

  it('H20: SUPER_ADMIN can suspend a VERIFIED company and reinstate it', () => {
    expect(companyMachine.transition('VERIFIED', 'SUSPEND', READY, ['SUPER_ADMIN'])).toBe(
      'SUSPENDED',
    );
    expect(companyMachine.transition('SUSPENDED', 'REINSTATE', READY, ['SUPER_ADMIN'])).toBe(
      'VERIFIED',
    );
  });

  it('H20: BRANCH_ADMIN keeps suspend/reinstate; VERIFIER and STAFF cannot', () => {
    expect(companyMachine.transition('VERIFIED', 'SUSPEND', READY, ['BRANCH_ADMIN'])).toBe(
      'SUSPENDED',
    );
    expect(() => companyMachine.transition('VERIFIED', 'SUSPEND', READY, ['VERIFIER'])).toThrow(
      ForbiddenError,
    );
    expect(() => companyMachine.transition('SUSPENDED', 'REINSTATE', READY, ['STAFF'])).toThrow(
      ForbiddenError,
    );
  });
});
