import { describe, expect, it } from 'vitest';
import { companyContactsSchema, registerCompanySchema } from '@jobbank/shared';

const contact = (phone: string) => ({
  items: [{ name: 'Aisha Khan', phone, isPrimary: true }],
});

describe('company contact mobile validation', () => {
  it.each([
    ['3001234567', '+923001234567'],
    ['+923001234567', '+923001234567'],
    ['923001234567', '+923001234567'],
    ['0092 300 1234567', '+923001234567'],
    ['0300 1234567', '+923001234567'],
    ['300-1234567', '+923001234567'],
  ])('normalizes %s to the canonical format', (input, expected) => {
    expect(companyContactsSchema.parse(contact(input)).items[0]?.phone).toBe(expected);
  });

  it.each([
    '',
    '2001234567',
    '4001234567',
    '300123456',
    '30012345678',
    'letters',
    '!@#$',
    '+9230012345678',
    '+92923001234567',
    '+12025550123',
  ])('rejects invalid company contact number %j', (phone) => {
    expect(companyContactsSchema.safeParse(contact(phone)).success).toBe(false);
  });

  it('keeps external company registration status server-controlled', () => {
    const parsed = registerCompanySchema.parse({
      legalName: 'Example Company',
      legalStructure: 'PRIVATE_LIMITED',
      ntn: '1234567-8',
      industryCode: 'RETAIL',
      sizeBand: '1_10',
      status: 'VERIFIED',
      registrationSource: 'STAFF_ASSISTED',
    });

    expect(parsed).not.toHaveProperty('status');
    expect(parsed).not.toHaveProperty('registrationSource');
  });
});
