import { describe, expect, it } from 'vitest';
import {
  companyHeadOfficeSchema,
  companySiteSchema,
  isResubmitNoteSufficient,
  ntnSchema,
  resubmitSchema,
} from '@jobbank/shared';

// Regression tests for the H12 finding: company head-office / site cityCode
// used to be free text and was never checked against CITY master data.
describe('company location schemas (H12)', () => {
  const headOffice = {
    location: { lat: 24.86, lng: 67.01 },
    addressLine: 'Shahrah-e-Faisal, Karachi',
    cityCode: 'KARACHI',
    areaCode: 'GULSHAN',
    branchId: '00000000-0000-4000-8000-000000000001',
  };

  it('accepts a master-data city code', () => {
    expect(companyHeadOfficeSchema.parse(headOffice).cityCode).toBe('KARACHI');
  });

  it('normalises a lower-case city code, like the applicant side', () => {
    expect(companyHeadOfficeSchema.parse({ ...headOffice, cityCode: 'karachi' }).cityCode).toBe(
      'KARACHI',
    );
  });

  it('rejects free-text city names', () => {
    expect(() =>
      companyHeadOfficeSchema.parse({ ...headOffice, cityCode: 'Karachi city' }),
    ).toThrow();
    expect(() =>
      companyHeadOfficeSchema.parse({ ...headOffice, cityCode: 'somewhere near Clifton' }),
    ).toThrow();
  });

  it('rejects a free-text area code on sites too', () => {
    const site = {
      label: 'Factory',
      location: { lat: 24.86, lng: 67.01 },
      addressLine: 'Korangi Industrial Area',
      cityCode: 'KARACHI',
      areaCode: 'near the big market',
    };
    expect(() => companySiteSchema.parse(site)).toThrow();
    expect(companySiteSchema.parse({ ...site, areaCode: 'KORANGI' }).areaCode).toBe('KORANGI');
    expect(companySiteSchema.parse({ ...site, areaCode: undefined }).areaCode).toBeNull();
  });
});

// M17 is PARTIAL: only the NTN format is validated. The 8th digit is a check
// digit, but no FBR algorithm could be verified from an in-repo source, so it
// is intentionally not validated (see the ntnSchema comment). These tests pin
// the current format behaviour so a future check-digit implementation changes
// them deliberately, not silently.
describe('ntnSchema (M17 — format only)', () => {
  it('accepts the 7-digit + check-digit form and normalises the dash', () => {
    expect(ntnSchema.parse('12345678')).toBe('1234567-8');
    expect(ntnSchema.parse('1234567-8')).toBe('1234567-8');
  });

  it('accepts a legacy 7-digit NTN and a 13-digit CNIC-based NTN', () => {
    expect(ntnSchema.parse('1234567')).toBe('1234567');
    expect(ntnSchema.parse('4210112345671')).toBe('4210112345671');
  });

  it('rejects malformed NTNs', () => {
    expect(() => ntnSchema.parse('123456')).toThrow();
    expect(() => ntnSchema.parse('1234567-89')).toThrow();
    expect(() => ntnSchema.parse('ABCDEFG-8')).toThrow();
  });
});

// M18: resubmitting needs a note (min 10 chars) OR proof something changed.
// The schema cannot see the database, so it still accepts a null note — the
// OR is enforced by the resubmit guard in domains/company/profile.ts.
describe('resubmit note (M18)', () => {
  it('the schema accepts a null note', () => {
    expect(resubmitSchema.parse({ note: null }).note).toBeNull();
    expect(resubmitSchema.parse({}).note).toBeNull();
  });

  it('a note counts only at 10+ non-blank characters', () => {
    expect(isResubmitNoteSufficient(null)).toBe(false);
    expect(isResubmitNoteSufficient(undefined)).toBe(false);
    expect(isResubmitNoteSufficient('   ')).toBe(false);
    expect(isResubmitNoteSufficient('fixed it')).toBe(false);
    expect(isResubmitNoteSufficient('Uploaded the renewed NTN certificate')).toBe(true);
  });
});
