import { z } from 'zod';

/**
 * Pakistani phone numbers, shared by the company and applicant contracts.
 * Mobile or landline → E.164 ("021 3456 7890" → "+922134567890").
 */
export const pkPhoneSchema = z
  .string('Enter a phone number')
  .transform((value) => {
    let digits = value.replace(/\D/g, '');
    if (digits.startsWith('0092')) digits = digits.slice(4);
    else if (digits.startsWith('92') && digits.length >= 11) digits = digits.slice(2);
    else if (digits.startsWith('0')) digits = digits.slice(1);
    return digits;
  })
  .pipe(z.string().regex(/^[1-9]\d{8,9}$/, 'Enter a Pakistani phone number, e.g. 0300 1234567'))
  .transform((national) => `+92${national}`);
