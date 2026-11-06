import { describe, expect, it } from 'vitest';
import { ageBand, maskEmail, maskFullName, maskPhone, REDACTED, redactPii } from './masking';

describe('display masks', () => {
  it('masks phones, emails and names', () => {
    expect(maskPhone('+923001234567')).toBe('+92 300 •••4567');
    expect(maskPhone('03001234567')).toBe('+92 300 •••4567');
    expect(maskPhone('junk')).toBe('•••');
    expect(maskEmail('ayesha.khan@gmail.com')).toBe('a•••n@gmail.com');
    expect(maskEmail('ab@x.pk')).toBe('a•••@x.pk');
    expect(maskFullName('Muhammad Ahmed Raza')).toBe('Muhammad R.');
    expect(maskFullName('Zainab')).toBe('Zainab');
  });

  it('bands ages at birthday boundaries', () => {
    const today = new Date('2026-10-01T00:00:00Z');
    expect(ageBand('2008-10-02', today)).toBe('Under 18'); // turns 18 tomorrow
    expect(ageBand('2008-10-01', today)).toBe('18–24');
    expect(ageBand('2001-10-02', today)).toBe('18–24'); // still 24
    expect(ageBand('2001-10-01', today)).toBe('25–34');
    expect(ageBand('1980-01-01', today)).toBe('45–54');
    expect(ageBand('1960-01-01', today)).toBe('55+');
  });
});

describe('redactPii', () => {
  it('redacts sensitive keys at any depth, keeps everything else', () => {
    const input = {
      id: 'a-1',
      fullName: 'Ayesha Khan',
      cnic: '4210112345671',
      contact: { phone: '+923001234567', Email: 'a@b.pk', preferredShift: 'morning' },
      address_line1: 'House 5, Block 13',
      location: { lat: 24.9, lng: 67.1 },
      documents: [{ type: 'CNIC_FRONT', key: 'branch/x/y.jpg' }],
      password_hash: 'x',
      status: 'ACTIVE',
      emptyPhone: null,
    };
    const out = redactPii(input);
    expect(out.cnic).toBe(REDACTED);
    expect(out.contact).toEqual({ phone: REDACTED, Email: REDACTED, preferredShift: 'morning' });
    expect(out.address_line1).toBe(REDACTED);
    expect(out.location).toBe(REDACTED);
    expect(out.password_hash).toBe(REDACTED);
    expect(out.documents).toEqual([{ type: 'CNIC_FRONT', key: 'branch/x/y.jpg' }]);
    expect(out.status).toBe('ACTIVE');
    // Input is untouched.
    expect(input.cnic).toBe('4210112345671');
  });

  it('redacts NTN, company contacts, head-office and permanent addresses', () => {
    const out = redactPii({
      legalName: 'Sunrise Foods (Pvt) Ltd',
      ntn: '8765432-1',
      contactPhone: '0302-8765432',
      contactEmail: 'bilal@example.com',
      headOfficeAddress: 'Plot 8, Korangi Industrial Area, Karachi',
      permanentAddress: { addressLine: 'House 22, Street 2, Hyderabad', cityCode: 'HYD' },
      address: { addressLine: 'Flat 4, North Nazimabad', cityCode: 'KHI' },
      branchId: 'b-1',
    });
    expect(out.legalName).toBe('Sunrise Foods (Pvt) Ltd');
    expect(out.ntn).toBe(REDACTED);
    expect(out.contactPhone).toBe(REDACTED);
    expect(out.contactEmail).toBe(REDACTED);
    expect(out.headOfficeAddress).toBe(REDACTED);
    expect(out.permanentAddress).toBe(REDACTED);
    // `address` is itself a sensitive key, so the whole object is redacted
    // (the nested `addressLine` key never gets a chance to be checked alone).
    expect(out.address).toBe(REDACTED);
    expect(out.branchId).toBe('b-1');
  });

  it('handles dates and cycles', () => {
    const node: Record<string, unknown> = { at: new Date('2026-10-01T00:00:00Z') };
    node.self = node;
    expect(redactPii(node)).toEqual({ at: '2026-10-01T00:00:00.000Z', self: '[Circular]' });
  });
});
