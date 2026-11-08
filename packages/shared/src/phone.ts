import { z } from 'zod';

/** Strip a leading 0092 / 92 / 0 so only the national digits remain. */
const nationalDigits = (value: string): string => {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('0092')) digits = digits.slice(4);
  else if (digits.startsWith('92') && digits.length >= 11) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  return digits;
};

const toE164 = (national: string) => `+92${national}`;

/**
 * Pakistani phone numbers, shared by the company and applicant contracts.
 * Mobile or landline → E.164 ("021 3456 7890" → "+922134567890").
 * Only use this where a landline is genuinely acceptable (e.g. a company
 * head-office number). Anything that must reach a person — tokens, applicant
 * accounts, phone changes — must use pkMobileSchema instead (M21): a token
 * issued to a landline can never receive an SMS.
 */
export const pkPhoneSchema = z
  .string('Enter a phone number')
  .transform(nationalDigits)
  .pipe(z.string().regex(/^[1-9]\d{8,9}$/, 'Enter a Pakistani phone number, e.g. 0300 1234567'))
  .transform(toE164);

/**
 * Pakistani MOBILE numbers only (03xx, 10 national digits) → E.164.
 * Landlines are rejected: they cannot receive the SMS a token or an
 * applicant account depends on.
 */
export const pkMobileSchema = z
  .string('Enter a mobile number')
  .transform(nationalDigits)
  .pipe(z.string().regex(/^3\d{9}$/, 'Enter a Pakistani mobile number, e.g. 0300 1234567'))
  .transform(toE164);
