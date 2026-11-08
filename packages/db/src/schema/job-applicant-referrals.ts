import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { applicants } from './applicants';
import { users } from './identity';
import { jobs } from './jobs';

// ─── job_applicant_referrals ────────────────────────────────────────────
// A job (vacancy) a staff member has shared with a specific applicant.
// The applicant jobs page shows ONLY jobs with a row here (interim rule,
// referral workflow §4.4) — no row here, no visibility (migration 0033).
export const jobApplicantReferrals = pgTable(
  'job_applicant_referrals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    /** The applicant the job was referred to. */
    applicantId: uuid('applicant_id')
      .notNull()
      .references(() => applicants.id, { onDelete: 'cascade' }),
    /** Staff member who made the referral (kept for audit, not for display). */
    referredBy: uuid('referred_by').references(() => users.id, { onDelete: 'set null' }),
    /** Optional note from the referring staff member, shown to the applicant. */
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One referral per job per applicant: re-referring the same job to the
    // same applicant is a no-op, never a duplicate row.
    uniqueIndex('job_applicant_referrals_job_applicant_unique').on(t.jobId, t.applicantId),
    index('job_applicant_referrals_applicant_idx').on(t.applicantId),
    index('job_applicant_referrals_job_idx').on(t.jobId),
  ],
);
