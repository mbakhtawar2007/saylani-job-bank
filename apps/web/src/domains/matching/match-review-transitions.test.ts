import { describe, expect, it, vi } from 'vitest';
import { ConflictError } from '@/domains/shared/errors';
import type { AuditEntry } from '@/domains/shared/audit';
import type { GuardedJob } from '@/domains/job';
import type { Transaction } from '@/lib/db';
import {
  MATCH_REVIEW_STATUSES,
  MATCH_REVIEW_TRANSITIONS,
  syncMatchHire,
  type MatchReviewStatus,
} from './service';

function selectQuery(result: unknown) {
  const query = {
    from: () => query,
    where: () => query,
    for: async () => result,
  };
  return query;
}

function updateQuery(result: unknown) {
  const promise = Promise.resolve(result);
  const query: {
    set: () => typeof query;
    where: () => typeof query;
    returning: () => Promise<unknown>;
    then: typeof promise.then;
  } = {
    set: () => query,
    where: () => query,
    returning: async () => result,
    then: promise.then.bind(promise),
  };
  return query;
}

function mockTransaction(selectResults: unknown[], updateResults: unknown[] = []) {
  return {
    select: vi.fn(() => selectQuery(selectResults.shift())),
    update: vi.fn(() => updateQuery(updateResults.shift())),
  } as unknown as Transaction;
}

const openJob = {
  id: 'job-1',
  status: 'OPEN',
  vacancies: 1,
  vacanciesFilled: 0,
  companyId: 'company-1',
} as GuardedJob;

const applicationRow = (status: string) => ({
  id: 'application-1',
  jobId: openJob.id,
  branchId: 'branch-1',
  status,
});

describe('H-1 match offer placement guard', () => {
  it.each([
    'INTERVIEW_FAILED',
    'INTERVIEW_CANCELLED',
    'REJECTED',
    'EMPLOYER_REJECTED',
    'APPLICANT_REFUSED',
  ])('%s cannot be selected for a match offer or fill a vacancy', async (status) => {
    const row = applicationRow(status);
    const tx = mockTransaction([[{ id: row.id, branchId: row.branchId, status }], [row], [row]]);
    const audit = vi.fn<(entry: AuditEntry) => void>();

    await expect(
      syncMatchHire(tx, openJob.id, 'applicant-1', openJob, audit, { kind: 'OFFER' }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(row.status).toBe(status);
    expect(tx.update).not.toHaveBeenCalled();
    expect(openJob.vacanciesFilled).toBe(0);
  });

  it('rejects a match offer when no application exists and leaves the vacancy open', async () => {
    const tx = mockTransaction([[]]);

    await expect(
      syncMatchHire(tx, openJob.id, 'applicant-1', openJob, vi.fn(), { kind: 'OFFER' }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(tx.update).not.toHaveBeenCalled();
    expect(openJob.vacanciesFilled).toBe(0);
  });

  it('accepts only OFFER_EXTENDED, audits the status change, and fills one vacancy', async () => {
    const row = applicationRow('OFFER_EXTENDED');
    const tx = mockTransaction(
      [[{ id: row.id, branchId: row.branchId, status: row.status }], [row]],
      [[{ ...row, status: 'HIRED' }], undefined],
    );
    const entries: AuditEntry[] = [];

    const filled = await syncMatchHire(
      tx,
      openJob.id,
      'applicant-1',
      openJob,
      (entry) => entries.push(entry),
      { kind: 'ACCEPT', vacancyReserved: false },
    );

    expect(filled).toBe(true);
    expect(tx.update).toHaveBeenCalledTimes(2);
    expect(entries).toEqual([
      expect.objectContaining({
        action: 'application.applicant_accepted',
        entityId: row.id,
        before: { status: 'OFFER_EXTENDED' },
        after: { status: 'HIRED' },
        reason: 'Applicant accepted the match offer',
      }),
    ]);
  });
});

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
