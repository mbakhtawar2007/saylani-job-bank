import { issueApplicantTokenSchema, karachiDay, tokenCodeFor } from '@jobbank/shared';
import { describe, expect, it } from 'vitest';

describe('tokenCodeFor', () => {
  it('pads the daily number to three digits', () => {
    expect(tokenCodeFor('KHI-GULSHAN', 7)).toBe('KHI-GULSHAN-007');
    expect(tokenCodeFor('KHI-GULSHAN', 123)).toBe('KHI-GULSHAN-123');
  });
});

describe('karachiDay', () => {
  it('uses the Pakistan calendar day, not UTC', () => {
    // 18:00 UTC is 23:00 in Karachi — still the 7th.
    expect(karachiDay(new Date('2026-11-07T18:00:00Z'))).toBe('2026-11-07');
    // 19:00 UTC is midnight in Karachi — already the 8th.
    expect(karachiDay(new Date('2026-11-07T19:00:00Z'))).toBe('2026-11-08');
  });
});

describe('issueApplicantTokenSchema', () => {
  const branchId = '123e4567-e89b-12d3-a456-426614174000';

  it('accepts a CNIC with dashes and a name', () => {
    const parsed = issueApplicantTokenSchema.safeParse({
      branchId,
      cnic: '42101-1234567-1',
      applicantName: 'Ahmed Raza',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.cnic).toBe('4210112345671');
  });

  it('rejects a short CNIC and a short name', () => {
    expect(
      issueApplicantTokenSchema.safeParse({ branchId, cnic: '42101', applicantName: 'Ahmed' })
        .success,
    ).toBe(false);
    expect(
      issueApplicantTokenSchema.safeParse({
        branchId,
        cnic: '4210112345671',
        applicantName: 'Al',
      }).success,
    ).toBe(false);
  });
});
