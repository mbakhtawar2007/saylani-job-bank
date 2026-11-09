import { describe, expect, it } from 'vitest';
import { isKnownNotificationType } from './service';

// Guard (2026-11-09): notification reads filter to known types, so a row
// left behind by a removed feature can never render as a live card again.
describe('isKnownNotificationType', () => {
  it('accepts the live job-to-applicant referral type', () => {
    expect(isKnownNotificationType('JOB_REFERRED_TO_APPLICANT')).toBe(true);
  });

  it('rejects the retired job-to-employer referral type', () => {
    expect(isKnownNotificationType('JOB_REFERRED')).toBe(false);
  });

  it('accepts the other live types', () => {
    for (const type of [
      'MATCH_SHORTLISTED',
      'APPLICANT_REFERRED',
      'MESSAGE',
      'COMPANY_SUSPENDED',
    ]) {
      expect(isKnownNotificationType(type)).toBe(true);
    }
  });

  it('rejects unknown types', () => {
    expect(isKnownNotificationType('NOPE')).toBe(false);
    expect(isKnownNotificationType('')).toBe(false);
  });
});
