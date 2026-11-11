/**
 * Pakistani mobile numbers. Canonical storage format is E.164: +92 3XX XXXXXXX → "+923001234567".
 * Mobile numbers start with 3 after the country code and have 10 national digits.
 */

import { PAKISTAN_MOBILE_PREFIXES as SHARED_MOBILE_PREFIXES } from '@jobbank/shared';

const NATIONAL_MOBILE = /^3\d{9}$/;

/** Original Pakistani mobile allocations; MNP means these do not identify the current operator. */
export const PAKISTAN_MOBILE_PREFIXES = [
  ...Array.from({ length: 10 }, (_, i) => ({ prefix: `30${i}`, network: 'Jazz' })),
  ...Array.from({ length: 10 }, (_, i) => ({ prefix: `31${i}`, network: 'Zong' })),
  ...Array.from({ length: 10 }, (_, i) => ({ prefix: `32${i}`, network: 'Jazz' })),
  ...Array.from({ length: 9 }, (_, i) => ({ prefix: `33${i}`, network: 'Ufone' })),
  { prefix: '339', network: 'ONIC' },
  ...Array.from({ length: 10 }, (_, i) => ({ prefix: `34${i}`, network: 'Telenor' })),
  ...Array.from({ length: 3 }, (_, i) => ({ prefix: `35${5 + i}`, network: 'SCOM' })),
  ...Array.from({ length: 6 }, (_, i) => ({ prefix: `36${i}`, network: 'Zong' })),
  ...Array.from({ length: 9 }, (_, i) => ({ prefix: `37${i + 1}`, network: 'ONIC' })),
] as const;

// Audit 2026-11-11 (L-03): the supported set comes from @jobbank/shared —
// the same list pkMobileSchema refines against — so the input, the schema
// and the server domains can never disagree again. The table above only
// adds the network label for the prefix dropdown; format.test.ts asserts
// the two lists hold the same prefixes.
const supportedPrefixes = new Set<string>(SHARED_MOBILE_PREFIXES);

export function isSupportedPkMobile(e164: string): boolean {
  return supportedPrefixes.has(e164.slice(3, 6));
}

/** Extracts the 10-digit national mobile number from any common way people type it. */
export function toNationalMobileDigits(input: string): string {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('0092')) digits = digits.slice(4);
  else if (digits.startsWith('92') && digits.length > 10) digits = digits.slice(2);
  else if (digits.startsWith('03')) digits = digits.slice(1);
  return digits.slice(0, 10);
}

/** Returns E.164 (+923XXXXXXXXX) or null if the input is not a valid PK mobile number. */
export function normalizePkMobile(input: string): string | null {
  const national = toNationalMobileDigits(input);
  return NATIONAL_MOBILE.test(national) ? `+92${national}` : null;
}

/** "3001234567" → "300 1234567" (partial input is formatted progressively). */
export function formatPkMobileNational(digits: string): string {
  const clean = digits.replace(/\D/g, '').slice(0, 10);
  return clean.length <= 3 ? clean : `${clean.slice(0, 3)} ${clean.slice(3)}`;
}

/** "+923001234567" → "+92 300 1234567" for display. */
export function formatPkMobileDisplay(e164: string): string {
  const national = toNationalMobileDigits(e164);
  return national ? `+92 ${formatPkMobileNational(national)}` : e164;
}

/**
 * M11 — mask a Pakistani mobile for employer display: "+923001234567" →
 * "+92300***4567" (first 6 chars kept, middle masked, last 4 kept). The
 * employer can still recognise the number but cannot call or message the
 * candidate off-platform; contact runs through the in-app application chat
 * (see placement/employer.ts sendMessage). Same shape as the log mask in
 * lib/sms/mask.ts, kept here so display code does not import from sms.
 */
export function maskPkMobile(e164: string): string {
  return e164.length > 8 ? `${e164.slice(0, 6)}***${e164.slice(-4)}` : '***';
}
