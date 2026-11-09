import { describe, expect, it } from 'vitest';
import { isReferrableApplicant, referJobToApplicantSchema } from './applicant-referrals';

// Referrable applicant (workflow §5, interim rule 2026-11-09): any profile
// that is not RESTRICTED — ACTIVE or INACTIVE — with an identity that is
// VERIFIED or still UNVERIFIED. Only RESTRICTED profiles and REJECTED
// identities are not referrable.
describe('isReferrableApplicant', () => {
  it('ACTIVE + VERIFIED is referrable', () => {
    expect(isReferrableApplicant({ status: 'ACTIVE', identityStatus: 'VERIFIED' })).toBe(true);
  });

  it('ACTIVE + UNVERIFIED is referrable for now (interim rule)', () => {
    expect(isReferrableApplicant({ status: 'ACTIVE', identityStatus: 'UNVERIFIED' })).toBe(true);
  });

  it('an INACTIVE profile is referrable for now (interim rule)', () => {
    expect(isReferrableApplicant({ status: 'INACTIVE', identityStatus: 'VERIFIED' })).toBe(true);
  });

  it('a RESTRICTED profile is not referrable', () => {
    expect(isReferrableApplicant({ status: 'RESTRICTED', identityStatus: 'VERIFIED' })).toBe(false);
  });

  it('an ACTIVE profile with a REJECTED identity is not referrable', () => {
    expect(isReferrableApplicant({ status: 'ACTIVE', identityStatus: 'REJECTED' })).toBe(false);
  });
});

describe('referJobToApplicantSchema', () => {
  it('accepts a valid applicant id with an optional note', () => {
    const parsed = referJobToApplicantSchema.parse({
      applicantId: '123e4567-e89b-12d3-a456-426614174000',
      note: 'Good fit — night shift preferred.',
    });
    expect(parsed.applicantId).toBe('123e4567-e89b-12d3-a456-426614174000');
    expect(parsed.note).toBe('Good fit — night shift preferred.');
  });

  it('accepts a missing note', () => {
    const parsed = referJobToApplicantSchema.parse({
      applicantId: '123e4567-e89b-12d3-a456-426614174000',
    });
    expect(parsed.note).toBeUndefined();
  });

  it('trims the note', () => {
    const parsed = referJobToApplicantSchema.parse({
      applicantId: '123e4567-e89b-12d3-a456-426614174000',
      note: '  hello  ',
    });
    expect(parsed.note).toBe('hello');
  });

  it('rejects a non-uuid applicant id', () => {
    expect(() => referJobToApplicantSchema.parse({ applicantId: 'not-a-uuid' })).toThrow();
  });

  it('rejects a note over 500 characters', () => {
    expect(() =>
      referJobToApplicantSchema.parse({
        applicantId: '123e4567-e89b-12d3-a456-426614174000',
        note: 'x'.repeat(501),
      }),
    ).toThrow();
  });
});
