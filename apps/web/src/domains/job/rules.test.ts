import { describe, expect, it } from 'vitest';
import { ForbiddenError } from '@/domains/shared/errors';
import { assertCompanyNotSuspended } from './rules';

// Audit 2026-11-11 (L-26): suspension freezes job edits. Scoped to
// SUSPENDED only — DRAFT / INFO_REQUESTED / REJECTED companies must still be
// able to edit draft jobs (normal onboarding flow), VERIFIED is unaffected.
describe('assertCompanyNotSuspended', () => {
  it('throws a 403 naming the suspension for a SUSPENDED company', () => {
    try {
      assertCompanyNotSuspended('SUSPENDED');
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenError);
      expect((error as ForbiddenError).status).toBe(403);
      expect((error as ForbiddenError).message).toMatch(/suspended/i);
    }
  });

  it.each(['DRAFT', 'INFO_REQUESTED', 'REJECTED', 'VERIFIED'] as const)(
    'allows edits for a %s company',
    (status) => {
      expect(() => assertCompanyNotSuspended(status)).not.toThrow();
    },
  );
});
