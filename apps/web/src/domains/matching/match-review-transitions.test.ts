import { describe, expect, it } from 'vitest';
import { MATCH_REVIEW_STATUSES, MATCH_REVIEW_TRANSITIONS, type MatchReviewStatus } from './service';

// H19 — the review-status transition table, as pure data (no DB needed).
describe('MATCH_REVIEW_TRANSITIONS', () => {
  it('covers every review status', () => {
    for (const status of MATCH_REVIEW_STATUSES) {
      expect(MATCH_REVIEW_TRANSITIONS).toHaveProperty(status);
    }
  });

  it('NEW goes to REVIEWED / SHORTLISTED / REJECTED, never straight to HIRED', () => {
    expect([...MATCH_REVIEW_TRANSITIONS.NEW].sort()).toEqual([
      'REJECTED',
      'REVIEWED',
      'SHORTLISTED',
    ]);
  });

  it('REVIEWED goes to SHORTLISTED / REJECTED only', () => {
    expect([...MATCH_REVIEW_TRANSITIONS.REVIEWED].sort()).toEqual(['REJECTED', 'SHORTLISTED']);
  });

  it('SHORTLISTED goes to HIRED / REJECTED only', () => {
    expect([...MATCH_REVIEW_TRANSITIONS.SHORTLISTED].sort()).toEqual(['HIRED', 'REJECTED']);
  });

  it('HIRED and REJECTED are terminal', () => {
    expect(MATCH_REVIEW_TRANSITIONS.HIRED).toEqual([]);
    expect(MATCH_REVIEW_TRANSITIONS.REJECTED).toEqual([]);
  });

  it('every listed target is a real review status', () => {
    const all = new Set<MatchReviewStatus>(MATCH_REVIEW_STATUSES);
    for (const targets of Object.values(MATCH_REVIEW_TRANSITIONS)) {
      for (const target of targets) expect(all.has(target)).toBe(true);
    }
  });
});
