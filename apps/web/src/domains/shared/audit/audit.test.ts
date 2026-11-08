import { describe, expect, it } from 'vitest';
import { redactAuditReason } from './audit';

describe('redactAuditReason (M14)', () => {
  it('redacts a CNIC, a mobile and an email pasted into a reason', () => {
    expect(redactAuditReason('Called 03001234567 about CNIC 42101-1234567-1, see a@b.pk')).toBe(
      'Called [REDACTED] about CNIC [REDACTED], see [REDACTED]',
    );
    expect(redactAuditReason('Duplicate of 4210112345671')).toBe('Duplicate of [REDACTED]');
    expect(redactAuditReason('Called +92 300 1234567')).toBe('Called [REDACTED]');
  });

  it('leaves ordinary reasons and empty values alone', () => {
    expect(redactAuditReason('Applicant asked to pause')).toBe('Applicant asked to pause');
    expect(redactAuditReason(null)).toBe(null);
    expect(redactAuditReason('')).toBe(null);
  });
});
