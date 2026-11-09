import { describe, expect, it } from 'vitest';
import { isDirectReferrableApplicant, referApplicantToEmployerForJobSchema } from './index';

// Direct refer from the staff job page (2026-11-10): same interim "filhal"
// rule as job→applicant referrals — any profile that is not RESTRICTED,
// with an identity VERIFIED or still UNVERIFIED. Only RESTRICTED profiles
// and REJECTED identities are not referrable.
describe('isDirectReferrableApplicant', () => {
  it('ACTIVE + VERIFIED is referrable', () => {
    expect(isDirectReferrableApplicant({ status: 'ACTIVE', identityStatus: 'VERIFIED' })).toBe(
      true,
    );
  });

  it('ACTIVE + UNVERIFIED is referrable for now (interim rule)', () => {
    expect(isDirectReferrableApplicant({ status: 'ACTIVE', identityStatus: 'UNVERIFIED' })).toBe(
      true,
    );
  });

  it('an INACTIVE profile is referrable for now (interim rule)', () => {
    expect(isDirectReferrableApplicant({ status: 'INACTIVE', identityStatus: 'VERIFIED' })).toBe(
      true,
    );
  });

  it('a RESTRICTED profile is not referrable', () => {
    expect(isDirectReferrableApplicant({ status: 'RESTRICTED', identityStatus: 'VERIFIED' })).toBe(
      false,
    );
  });

  it('an ACTIVE profile with a REJECTED identity is not referrable', () => {
    expect(isDirectReferrableApplicant({ status: 'ACTIVE', identityStatus: 'REJECTED' })).toBe(
      false,
    );
  });
});

describe('referApplicantToEmployerForJobSchema', () => {
  it('accepts a valid applicant id with an optional note', () => {
    const parsed = referApplicantToEmployerForJobSchema.parse({
      applicantId: '123e4567-e89b-12d3-a456-426614174000',
      note: 'Strong match — available immediately.',
    });
    expect(parsed.applicantId).toBe('123e4567-e89b-12d3-a456-426614174000');
    expect(parsed.note).toBe('Strong match — available immediately.');
  });

  it('accepts a missing note', () => {
    const parsed = referApplicantToEmployerForJobSchema.parse({
      applicantId: '123e4567-e89b-12d3-a456-426614174000',
    });
    expect(parsed.note).toBeUndefined();
  });

  it('rejects a non-uuid applicant id', () => {
    expect(() =>
      referApplicantToEmployerForJobSchema.parse({ applicantId: 'not-a-uuid' }),
    ).toThrow();
  });

  it('rejects a note over 500 characters', () => {
    expect(() =>
      referApplicantToEmployerForJobSchema.parse({
        applicantId: '123e4567-e89b-12d3-a456-426614174000',
        note: 'x'.repeat(501),
      }),
    ).toThrow();
  });
});
