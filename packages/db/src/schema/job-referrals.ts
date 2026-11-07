import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { companies } from './companies';
import { users } from './identity';
import { jobs } from './jobs';

// ─── job_referrals ──────────────────────────────────────────────────────
// A job (vacancy) a staff member has shared with a specific employer
// company. An employer sees two kinds of jobs: the ones their own company
// posted, and the ones staff referred to their company. This table is the
// gate for the referred half — no row here, no visibility (migration 0030).
export const jobReferrals = pgTable(
  'job_referrals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    /** The employer company the job was referred to. */
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    /** Staff member who made the referral (kept for audit, not for display). */
    referredBy: uuid('referred_by').references(() => users.id, { onDelete: 'set null' }),
    /** Optional note from the referring staff member, shown to the employer. */
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One referral per job per company: re-referring the same job to the
    // same employer is a no-op, never a duplicate row.
    uniqueIndex('job_referrals_job_company_unique').on(t.jobId, t.companyId),
    index('job_referrals_company_idx').on(t.companyId),
    index('job_referrals_job_idx').on(t.jobId),
  ],
);
