import { describe, expect, it } from 'vitest';
import { companyEditability } from './rules';

describe('companyEditability', () => {
  it('lets the employer edit while registering or fixing a rejected / info-requested company', () => {
    expect(companyEditability('DRAFT')).toMatchObject({
      details: true,
      legal: true,
      contacts: true,
      locations: true,
      documents: true,
    });
    expect(companyEditability('INFO_REQUESTED').details).toBe(true);
    expect(companyEditability('REJECTED').contacts).toBe(true);
    // Branch moves are staff-only once the company has been submitted.
    expect(companyEditability('INFO_REQUESTED').branch).toBe(false);
  });

  it('locks everything while a verifier is reviewing', () => {
    for (const status of ['SUBMITTED', 'UNDER_VERIFICATION', 'RESUBMITTED'] as const) {
      expect(companyEditability(status)).toEqual({
        details: false,
        legal: false,
        contacts: false,
        locations: false,
        branch: false,
        documents: false,
      });
    }
  });

  it('keeps a verified company fully read-only for the employer', () => {
    // Regression: VERIFIED used to allow details/contacts/locations edits, so an
    // employer could change the very details the verified badge vouched for.
    // Corrections now go through Job Bank staff (company:manage).
    expect(companyEditability('VERIFIED')).toEqual({
      details: false,
      legal: false,
      contacts: false,
      locations: false,
      branch: false,
      documents: false,
    });
  });

  it('keeps a suspended company fully read-only for the employer', () => {
    expect(companyEditability('SUSPENDED')).toEqual({
      details: false,
      legal: false,
      contacts: false,
      locations: false,
      branch: false,
      documents: false,
    });
  });
});
