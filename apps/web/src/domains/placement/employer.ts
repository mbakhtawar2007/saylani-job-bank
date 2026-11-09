'server-only';
// Employer-side interview scheduling, decisions, applicant refusal, and chat.

import { schema } from '@jobbank/db';
import type { PaginationMeta } from '@jobbank/shared';
import { and, asc, count, eq, or } from 'drizzle-orm';
import { z } from 'zod';
import { runCommand } from '@/domains/shared/audit';
import { paginationMeta } from '@/domains/shared/pagination';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/domains/shared/errors';
import {
  assertCityAccess,
  assertPermission,
  hasPermission,
  type Actor,
} from '@/domains/shared/scope';
import { jobMachine } from '@/domains/job';
import { requireReasonCode } from '@/domains/matching';
import { db } from '@/lib/db';
import { maskPkMobile } from '@/lib/format/phone';
import { createNotification, notifyCompanyEmployers } from '@/domains/notifications';
import type { RequestContext } from '@/domains/shared/audit';
import {
  buildView,
  type ApplicationView,
  type ApplicationStatus,
  type PlacementListQuery,
} from './index';
import { assertFutureInterviewAt, futureInterviewAtSchema } from './interview-date';
import { lockAndTransitionApplication } from './machine';

type SignedIn = RequestContext & { actor: Actor };

const ap = schema.applications;
const am = schema.applicationMessages;

// ─── Types ────────────────────────────────────────────────────────────────

export interface ApplicantSummary {
  id: string;
  fullName: string;
  cityCode: string | null;
  phone: string | null;
  skills: { skillCode: string; level: string; years: number }[];
  experience: {
    employerName: string;
    jobTitle: string;
    startMonth: string;
    endMonth: string | null;
    isCurrent: boolean;
  }[];
}

export interface ApplicationWithApplicant extends ApplicationView {
  applicant: ApplicantSummary;
}

export interface MessageView {
  id: string;
  applicationId: string;
  senderId: string;
  senderRole: 'EMPLOYER' | 'APPLICANT';
  senderName: string;
  content: string;
  createdAt: string;
}

// ─── Schemas ──────────────────────────────────────────────────────────────

export const scheduleEmployerInterviewSchema = z.object({
  interviewAt: futureInterviewAtSchema,
  interviewLocation: z.string().trim().min(2).max(300).optional(),
  interviewNote: z.string().trim().max(500).optional(),
});
export type ScheduleEmployerInterviewInput = z.infer<typeof scheduleEmployerInterviewSchema>;

export const EMPLOYER_INTERVIEW_UPDATE_STATUSES = [
  'EMPLOYER_INTERVIEW_SCHEDULED',
  'EMPLOYER_INTERVIEW_POSTPONED',
  'EMPLOYER_INTERVIEW_CANCELLED',
] as const;
export type EmployerInterviewUpdateStatus = (typeof EMPLOYER_INTERVIEW_UPDATE_STATUSES)[number];

export const updateEmployerInterviewStatusSchema = z
  .object({
    status: z.enum(EMPLOYER_INTERVIEW_UPDATE_STATUSES),
    interviewAt: futureInterviewAtSchema.optional(),
    interviewLocation: z.string().trim().max(300).optional(),
    interviewNote: z.string().trim().max(500).optional(),
  })
  .superRefine((v, ctx) => {
    // M19 — rescheduling back to SCHEDULED without a new date would silently
    // keep the old date; the new date is required.
    if (v.status === 'EMPLOYER_INTERVIEW_SCHEDULED' && !v.interviewAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['interviewAt'],
        message: 'Provide a new interview date & time when rescheduling',
      });
    }
  });
export type UpdateEmployerInterviewStatusInput = z.infer<
  typeof updateEmployerInterviewStatusSchema
>;

export const EMPLOYER_DECISION_OPTIONS = ['HOLD', 'ACCEPTED', 'REJECTED'] as const;
export type EmployerDecisionOption = (typeof EMPLOYER_DECISION_OPTIONS)[number];

export const recordEmployerDecisionSchema = z
  .object({
    decision: z.enum(EMPLOYER_DECISION_OPTIONS),
    note: z.string().trim().max(500).optional(),
  })
  .superRefine((v, ctx) => {
    // M19 — a rejection without a reason note tells the applicant nothing.
    if (v.decision === 'REJECTED' && (v.note?.trim().length ?? 0) < 5) {
      ctx.addIssue({
        code: 'custom',
        path: ['note'],
        message: 'Add a short note (at least 5 characters) when rejecting',
      });
    }
  });
export type RecordEmployerDecisionInput = z.infer<typeof recordEmployerDecisionSchema>;

export const refuseJobOfferSchema = z.object({
  /**
   * H19 — unified with respondToJobOffer: a master-data REFUSAL_REASON code,
   * not free text. The human-readable label is stored on the application
   * (see refuseJobOffer) so existing displays keep showing real words.
   */
  reasonCode: z.string().trim().min(1).max(50),
  note: z.string().trim().max(500).optional(),
});
export type RefuseJobOfferInput = z.infer<typeof refuseJobOfferSchema>;

// ─── Helpers ──────────────────────────────────────────────────────────────

async function getApplicantSummary(applicantId: string): Promise<ApplicantSummary | null> {
  const [applicantRow] = await db
    .select({
      id: schema.applicants.id,
      fullName: schema.applicants.fullName,
      userId: schema.applicants.userId,
    })
    .from(schema.applicants)
    .where(eq(schema.applicants.id, applicantId))
    .limit(1);

  if (!applicantRow) return null;

  const [address, phone, skills, experience] = await Promise.all([
    db
      .select({ cityCode: schema.applicantAddresses.cityCode })
      .from(schema.applicantAddresses)
      .where(eq(schema.applicantAddresses.applicantId, applicantId))
      .limit(1),
    db
      .select({ phone: schema.users.phoneNumber })
      .from(schema.users)
      .where(eq(schema.users.id, applicantRow.userId))
      .limit(1),
    db
      .select({
        skillCode: schema.applicantSkills.skillCode,
        level: schema.applicantSkills.level,
        years: schema.applicantSkills.years,
      })
      .from(schema.applicantSkills)
      .where(eq(schema.applicantSkills.applicantId, applicantId)),
    db
      .select({
        employerName: schema.applicantExperience.employerName,
        jobTitle: schema.applicantExperience.jobTitle,
        startMonth: schema.applicantExperience.startMonth,
        endMonth: schema.applicantExperience.endMonth,
        isCurrent: schema.applicantExperience.isCurrent,
      })
      .from(schema.applicantExperience)
      .where(eq(schema.applicantExperience.applicantId, applicantId))
      .orderBy(asc(schema.applicantExperience.startMonth)),
  ]);

  return {
    id: applicantRow.id,
    fullName: applicantRow.fullName,
    cityCode: address[0]?.cityCode ?? null,
    // M11 (2026-11-08): employers see a masked phone — recognisable, not
    // callable. The employer's contact path is the in-app application chat
    // (sendMessage in this file), so masking removes off-platform contact
    // without removing contact. Staff views do not use this summary, so
    // staff still see the full number where they need it.
    phone: phone[0]?.phone ? maskPkMobile(phone[0].phone) : null,
    skills: skills.map((s) => ({ skillCode: s.skillCode, level: s.level, years: s.years })),
    experience: experience.map((e) => ({
      employerName: e.employerName,
      jobTitle: e.jobTitle,
      startMonth: e.startMonth,
      endMonth: e.endMonth,
      isCurrent: e.isCurrent,
    })),
  };
}

async function assertEmployerOwnsApplication(
  actor: Actor,
  applicationId: string,
): Promise<typeof ap.$inferSelect & { companyId: string }> {
  if (!actor.companyId) throw new ForbiddenError('Only employer users can perform this action');

  const [row] = await db.select().from(ap).where(eq(ap.id, applicationId)).limit(1);
  if (!row) throw new NotFoundError('Application', applicationId);

  const [jobRow] = await db
    .select({ companyId: schema.jobs.companyId })
    .from(schema.jobs)
    .where(eq(schema.jobs.id, row.jobId))
    .limit(1);

  if (!jobRow || jobRow.companyId !== actor.companyId)
    throw new NotFoundError('Application', applicationId);

  return { ...row, companyId: jobRow.companyId };
}

// ─── Queries ──────────────────────────────────────────────────────────────

export const EMPLOYER_VISIBLE_STATUSES: ApplicationStatus[] = [
  'FORWARDED',
  'EMPLOYER_INTERVIEW_SCHEDULED',
  'EMPLOYER_INTERVIEW_POSTPONED',
  'EMPLOYER_INTERVIEW_CANCELLED',
  'ON_HOLD',
  'OFFER_EXTENDED',
  'EMPLOYER_REJECTED',
  'APPLICANT_REFUSED',
  'HIRED',
];

/**
 * H17 — employer decisions are only decidable from these states. Mirrors
 * the placement machine's DECIDABLE_STATES; the machine re-checks inside
 * the transaction, this is the early, readable rejection. HIRED,
 * EMPLOYER_REJECTED, APPLICANT_REFUSED and REJECTED are terminal, and
 * SHORTLISTED is pre-referral, so no decision can resurrect a closed
 * application or pre-empt staff referral. This also closes the C3
 * double-fill edge: a match-HIRED application is HIRED here too, so an
 * employer ACCEPTED after it cannot extend a second offer that an
 * applicant accept would fill a second vacancy with.
 */
export const EMPLOYER_DECIDABLE_STATUSES: ApplicationStatus[] = [
  'FORWARDED',
  'EMPLOYER_INTERVIEW_SCHEDULED',
  'EMPLOYER_INTERVIEW_POSTPONED',
  'EMPLOYER_INTERVIEW_CANCELLED',
  'ON_HOLD',
];

export function assertEmployerCanDecide(status: ApplicationStatus): void {
  if (!EMPLOYER_DECIDABLE_STATUSES.includes(status))
    throw new ForbiddenError(
      `Cannot record an employer decision for an application in status ${status}`,
    );
}

/** H18 — employers only ever see applications staff have forwarded. */
export function assertEmployerCanView(status: ApplicationStatus, applicationId: string): void {
  if (!EMPLOYER_VISIBLE_STATUSES.includes(status))
    throw new NotFoundError('Application', applicationId);
}

/** Employer: list all referred candidates for their company's jobs. */
export async function listReferrals(actor: Actor): Promise<ApplicationView[]>;
export async function listReferrals(
  actor: Actor,
  query: PlacementListQuery,
): Promise<{ items: ApplicationView[]; pagination: PaginationMeta }>;
export async function listReferrals(
  actor: Actor,
  query?: PlacementListQuery,
): Promise<ApplicationView[] | { items: ApplicationView[]; pagination: PaginationMeta }> {
  assertPermission(actor, 'decision:employer');
  if (!actor.companyId) return query ? { items: [], pagination: paginationMeta(query, 0) } : [];

  const companyJobs = await db
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .where(eq(schema.jobs.companyId, actor.companyId));

  if (companyJobs.length === 0)
    return query ? { items: [], pagination: paginationMeta(query, 0) } : [];

  const jobIds = companyJobs.map((j) => j.id);

  // M32 — the or(...jobIds) filter used to return every referral at once;
  // with a query only one page is fetched, plus a count for the metadata.
  const where = and(
    or(...jobIds.map((id) => eq(ap.jobId, id))),
    or(...EMPLOYER_VISIBLE_STATUSES.map((s) => eq(ap.status, s))),
  );
  const [totalRow] = query
    ? await db.select({ total: count() }).from(ap).where(where)
    : [{ total: 0 }];
  const base = db.select().from(ap).where(where);
  const rows = query ? await base.limit(query.limit).offset(query.offset) : await base;
  const items = await Promise.all(rows.map(buildView));
  if (!query) return items;
  return { items, pagination: paginationMeta(query, totalRow?.total ?? 0) };
}

/** Employer: get full application + applicant summary for one referred candidate. */
export async function getApplicationForEmployer(
  actor: Actor,
  applicationId: string,
): Promise<ApplicationWithApplicant> {
  assertPermission(actor, 'decision:employer');
  const row = await assertEmployerOwnsApplication(actor, applicationId);
  // H18 — pre-referral applications are invisible to employers, same as listReferrals.
  assertEmployerCanView(row.status, applicationId);
  const [view, applicant] = await Promise.all([
    buildView(row),
    getApplicantSummary(row.applicantId),
  ]);
  if (!applicant) throw new NotFoundError('Applicant', row.applicantId);
  return { ...view, applicant };
}

// ─── Commands ─────────────────────────────────────────────────────────────

/** Employer: schedule an employer-side interview for a referred candidate. */
export async function scheduleEmployerInterview(
  ctx: SignedIn,
  applicationId: string,
  input: ScheduleEmployerInterviewInput,
): Promise<ApplicationView> {
  assertPermission(ctx.actor, 'interview:schedule_employer');

  const row = await assertEmployerOwnsApplication(ctx.actor, applicationId);

  const schedulable: ApplicationStatus[] = [
    'FORWARDED',
    'EMPLOYER_INTERVIEW_POSTPONED',
    'EMPLOYER_INTERVIEW_CANCELLED',
  ];
  if (!schedulable.includes(row.status))
    throw new ForbiddenError(
      'Application must be FORWARDED or have a postponed/cancelled employer interview to schedule',
    );

  // H11 — service-level backstop: the schema already rejects past dates, but
  // direct callers bypass it.
  assertFutureInterviewAt(input.interviewAt);

  const [jobRow] = await db
    .select({ title: schema.jobs.title })
    .from(schema.jobs)
    .where(eq(schema.jobs.id, row.jobId))
    .limit(1);

  const [companyRow] = await db
    .select({ name: schema.companies.tradeName, legal: schema.companies.legalName })
    .from(schema.companies)
    .where(eq(schema.companies.id, row.companyId))
    .limit(1);

  const companyName = companyRow?.name ?? companyRow?.legal ?? '';
  const jobTitle = jobRow?.title ?? '';
  const interviewDate = new Date(input.interviewAt);

  const view = await runCommand(ctx, async ({ tx, audit }) => {
    const { to } = await lockAndTransitionApplication(
      tx,
      applicationId,
      'SCHEDULE_EMPLOYER_INTERVIEW',
    );
    const [updated] = await tx
      .update(ap)
      .set({
        status: to,
        employerInterviewAt: interviewDate,
        employerInterviewLocation: input.interviewLocation ?? null,
        employerInterviewNote: input.interviewNote ?? null,
        employerScheduledBy: ctx.actor.userId,
        updatedAt: new Date(),
      })
      .where(eq(ap.id, applicationId))
      .returning();

    audit({
      action: 'application.employer_interview_scheduled',
      entityType: 'application',
      entityId: applicationId,
      branchId: row.branchId,
    });
    return updated!;
  }).then(buildView);

  // Notify applicant
  const [applicantRow] = await db
    .select({ userId: schema.applicants.userId })
    .from(schema.applicants)
    .where(eq(schema.applicants.id, row.applicantId))
    .limit(1);

  if (applicantRow) {
    void createNotification(db, {
      userId: applicantRow.userId,
      type: 'INTERVIEW_SCHEDULED',
      title: `Interview scheduled — ${jobTitle}`,
      body: `Your interview with ${companyName} is on ${interviewDate.toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}${input.interviewLocation ? ` at ${input.interviewLocation}` : ''}. Scheduled by the employer via Job Bank.`,
      data: { applicationId, jobTitle, companyName },
    }).catch(() => null);
  }

  return view;
}

/** Employer: update the status of an employer-side interview. */
export async function updateEmployerInterviewStatus(
  ctx: SignedIn,
  applicationId: string,
  input: UpdateEmployerInterviewStatusInput,
): Promise<ApplicationView> {
  assertPermission(ctx.actor, 'interview:schedule_employer');

  const row = await assertEmployerOwnsApplication(ctx.actor, applicationId);

  const updatable: ApplicationStatus[] = [
    'EMPLOYER_INTERVIEW_SCHEDULED',
    'EMPLOYER_INTERVIEW_POSTPONED',
    'EMPLOYER_INTERVIEW_CANCELLED',
  ];
  if (!updatable.includes(row.status))
    throw new ForbiddenError('Can only update status for applications with an employer interview');

  // H11 — a supplied new date must be in the future.
  if (input.status === 'EMPLOYER_INTERVIEW_SCHEDULED' && input.interviewAt) {
    assertFutureInterviewAt(input.interviewAt);
  }
  // M19 — service-level backstop for the schema rule above: rescheduling
  // without a new date must not silently keep the old date.
  if (input.status === 'EMPLOYER_INTERVIEW_SCHEDULED' && !input.interviewAt) {
    throw new ValidationError([
      { path: 'interviewAt', message: 'Provide a new interview date & time when rescheduling' },
    ]);
  }

  const patch: Partial<typeof ap.$inferInsert> = {
    status: input.status,
    updatedAt: new Date(),
  };
  if (input.status === 'EMPLOYER_INTERVIEW_SCHEDULED') {
    if (input.interviewAt) patch.employerInterviewAt = new Date(input.interviewAt);
    if (input.interviewLocation !== undefined)
      patch.employerInterviewLocation = input.interviewLocation;
    if (input.interviewNote !== undefined) patch.employerInterviewNote = input.interviewNote;
  }

  const view = await runCommand(ctx, async ({ tx, audit }) => {
    const event =
      input.status === 'EMPLOYER_INTERVIEW_SCHEDULED'
        ? 'RESCHEDULE_EMPLOYER_INTERVIEW'
        : input.status === 'EMPLOYER_INTERVIEW_POSTPONED'
          ? 'POSTPONE_EMPLOYER_INTERVIEW'
          : 'CANCEL_EMPLOYER_INTERVIEW';
    const { to } = await lockAndTransitionApplication(tx, applicationId, event);
    patch.status = to;
    const [updated] = await tx.update(ap).set(patch).where(eq(ap.id, applicationId)).returning();
    audit({
      action: 'application.employer_interview_status_updated',
      entityType: 'application',
      entityId: applicationId,
      branchId: row.branchId,
      metadata: { status: input.status },
    });
    return updated!;
  }).then(buildView);

  // Notify applicant
  const [applicantRow] = await db
    .select({ userId: schema.applicants.userId })
    .from(schema.applicants)
    .where(eq(schema.applicants.id, row.applicantId))
    .limit(1);

  if (applicantRow) {
    const [jobRow] = await db
      .select({ title: schema.jobs.title })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, row.jobId))
      .limit(1);
    const jobTitle = jobRow?.title ?? '';

    type NotifType = 'INTERVIEW_POSTPONED' | 'INTERVIEW_CANCELLED' | 'INTERVIEW_RESCHEDULED';
    const notifType: NotifType =
      input.status === 'EMPLOYER_INTERVIEW_POSTPONED'
        ? 'INTERVIEW_POSTPONED'
        : input.status === 'EMPLOYER_INTERVIEW_CANCELLED'
          ? 'INTERVIEW_CANCELLED'
          : 'INTERVIEW_RESCHEDULED';

    const copy: Record<NotifType, { title: string; body: string }> = {
      INTERVIEW_POSTPONED: {
        title: `Employer interview postponed — ${jobTitle}`,
        body: 'Your employer interview has been postponed. They will contact you with a new time.',
      },
      INTERVIEW_CANCELLED: {
        title: `Employer interview cancelled — ${jobTitle}`,
        body: 'Your scheduled employer interview has been cancelled.',
      },
      INTERVIEW_RESCHEDULED: {
        title: `Employer interview rescheduled — ${jobTitle}`,
        body: view.employerInterviewAt
          ? `Your employer interview is now on ${new Date(view.employerInterviewAt).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}${view.employerInterviewLocation ? ` at ${view.employerInterviewLocation}` : ''}.`
          : 'Your employer interview has been rescheduled.',
      },
    };

    void createNotification(db, {
      userId: applicantRow.userId,
      type: notifType,
      title: copy[notifType].title,
      body: copy[notifType].body,
      data: { applicationId, jobTitle },
    }).catch(() => null);
  }

  return view;
}

/** Employer: record a hiring decision (HOLD / ACCEPTED / REJECTED). */
export async function recordEmployerDecision(
  ctx: SignedIn,
  applicationId: string,
  input: RecordEmployerDecisionInput,
): Promise<ApplicationView> {
  assertPermission(ctx.actor, 'decision:employer');

  const row = await assertEmployerOwnsApplication(ctx.actor, applicationId);

  // H18 — an employer cannot decide on an application they cannot see
  // (pre-referral). H17 — terminal / pre-referral states cannot be decided.
  assertEmployerCanView(row.status, applicationId);
  assertEmployerCanDecide(row.status);

  // M19 — service-level backstop for the schema rule: a rejection needs a note.
  if (input.decision === 'REJECTED' && (input.note?.trim().length ?? 0) < 5) {
    throw new ValidationError([
      { path: 'note', message: 'Add a short note (at least 5 characters) when rejecting' },
    ]);
  }

  const event =
    input.decision === 'HOLD'
      ? 'EMPLOYER_DECIDE_HOLD'
      : input.decision === 'ACCEPTED'
        ? 'EMPLOYER_DECIDE_ACCEPT'
        : 'EMPLOYER_DECIDE_REJECT';

  const [jobRow] = await db
    .select({ title: schema.jobs.title })
    .from(schema.jobs)
    .where(eq(schema.jobs.id, row.jobId))
    .limit(1);

  const [companyRow] = await db
    .select({ name: schema.companies.tradeName, legal: schema.companies.legalName })
    .from(schema.companies)
    .where(eq(schema.companies.id, row.companyId))
    .limit(1);

  const companyName = companyRow?.name ?? companyRow?.legal ?? '';
  const jobTitle = jobRow?.title ?? '';

  const view = await runCommand(ctx, async ({ tx, audit }) => {
    const { to: newStatus } = await lockAndTransitionApplication(tx, applicationId, event);
    const [updated] = await tx
      .update(ap)
      .set({
        status: newStatus,
        employerDecision: input.decision,
        employerDecisionAt: new Date(),
        employerDecisionBy: ctx.actor.userId,
        employerDecisionNote: input.note ?? null,
        updatedAt: new Date(),
      })
      .where(eq(ap.id, applicationId))
      .returning();

    audit({
      action: 'application.employer_decision',
      entityType: 'application',
      entityId: applicationId,
      branchId: row.branchId,
      metadata: { decision: input.decision },
    });
    return updated!;
  }).then(buildView);

  // Notify applicant
  const [applicantRow] = await db
    .select({ userId: schema.applicants.userId })
    .from(schema.applicants)
    .where(eq(schema.applicants.id, row.applicantId))
    .limit(1);

  if (applicantRow) {
    type NotifType = 'OFFER_ACCEPTED' | 'APPLICATION_ON_HOLD' | 'MATCH_REJECTED';
    const notifType: NotifType =
      input.decision === 'ACCEPTED'
        ? 'OFFER_ACCEPTED'
        : input.decision === 'REJECTED'
          ? 'MATCH_REJECTED'
          : 'APPLICATION_ON_HOLD';

    const copy: Record<NotifType, { title: string; body: string }> = {
      OFFER_ACCEPTED: {
        title: `Job offer — ${jobTitle}`,
        body: `You have received a job offer from ${companyName} for ${jobTitle}. Please respond via your dashboard.`,
      },
      APPLICATION_ON_HOLD: {
        title: `Application on hold — ${jobTitle}`,
        body: `${companyName} has placed your application on hold for ${jobTitle}. They may reach out again.`,
      },
      MATCH_REJECTED: {
        title: `Application not selected — ${jobTitle}`,
        body: `${companyName} has decided not to proceed with your application for ${jobTitle}.`,
      },
    };

    void createNotification(db, {
      userId: applicantRow.userId,
      type: notifType,
      title: copy[notifType].title,
      body: copy[notifType].body,
      data: { applicationId, jobTitle, companyName },
    }).catch(() => null);
  }

  return view;
}

/** Applicant: refuse a job offer. */
export async function refuseJobOffer(
  ctx: SignedIn,
  applicationId: string,
  input: RefuseJobOfferInput,
): Promise<ApplicationView> {
  if (!ctx.actor.applicantId) throw new ForbiddenError('Only applicants can refuse a job offer');

  const [row] = await db.select().from(ap).where(eq(ap.id, applicationId)).limit(1);
  if (!row) throw new NotFoundError('Application', applicationId);

  if (row.applicantId !== ctx.actor.applicantId)
    throw new ForbiddenError('You can only refuse your own job offer');

  if (row.status !== 'OFFER_EXTENDED')
    throw new ConflictError('Only OFFER_EXTENDED applications can be refused');

  // C3 — no vacancy to free here: a placement offer fills its vacancy only
  // when the applicant ACCEPTS (acceptJobOffer), so a refusal of an
  // OFFER_EXTENDED application never filled one. The rollback lives in the
  // match decline path (respondToJobOffer → freeVacancyForDeclinedMatchOffer),
  // where the match-HIRED decision fills the vacancy up front.
  // H19 — the refusal reason must be an active master-data REFUSAL_REASON
  // code, the same validation respondToJobOffer applies (the machine's
  // APPLICANT_REFUSE transition already guards the terminal-state flip).
  const reason = await requireReasonCode('REFUSAL_REASON', input.reasonCode, input.note);

  const [jobRow] = await db
    .select({ title: schema.jobs.title, companyId: schema.jobs.companyId })
    .from(schema.jobs)
    .where(eq(schema.jobs.id, row.jobId))
    .limit(1);

  const [_applicantRow] = await db
    .select({ userId: schema.applicants.userId })
    .from(schema.applicants)
    .where(eq(schema.applicants.id, row.applicantId))
    .limit(1);

  const [userRow] = await db
    .select({ name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, ctx.actor.userId))
    .limit(1);

  const view = await runCommand(ctx, async ({ tx, audit }) => {
    const { to } = await lockAndTransitionApplication(tx, applicationId, 'APPLICANT_REFUSE');
    const [updated] = await tx
      .update(ap)
      .set({
        status: to,
        applicantRefusalReason: reason.label,
        applicantRefusedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(ap.id, applicationId))
      .returning();

    // Open chat with first message from applicant
    const content = `I have refused this offer. Reason: ${reason.label}${input.note ? '. ' + input.note : ''}`;
    await tx.insert(am).values({
      applicationId,
      senderId: ctx.actor.userId,
      senderRole: 'APPLICANT',
      content,
    });

    audit({
      action: 'application.applicant_refused',
      entityType: 'application',
      entityId: applicationId,
      branchId: row.branchId,
      metadata: { reason: reason.code, reasonLabel: reason.label },
    });
    return updated!;
  }).then(buildView);

  // Notify employer company users
  if (jobRow?.companyId) {
    const jobTitle = jobRow.title;
    const applicantName = userRow?.name ?? 'The applicant';
    void notifyCompanyEmployers(db, jobRow.companyId, ({ userId }) => ({
      userId,
      type: 'OFFER_DECLINED' as const,
      title: `Offer refused — ${jobTitle}`,
      body: `${applicantName} has refused the offer for ${jobTitle}. See their message in the application.`,
      data: { applicationId, jobTitle },
    })).catch(() => null);
  }

  return view;
}

/**
 * Applicant: accept a job offer. This is the hire path: the application
 * becomes HIRED and one vacancy fills in the same transaction; when the
 * last vacancy fills, the job itself becomes FILLED (system event). Until
 * now an applicant could only refuse — nothing ever wrote HIRED, so jobs
 * stayed OPEN forever and hire counts were permanently zero.
 */
export async function acceptJobOffer(
  ctx: SignedIn,
  applicationId: string,
): Promise<ApplicationView> {
  if (!ctx.actor.applicantId) throw new ForbiddenError('Only applicants can accept a job offer');

  const [row] = await db.select().from(ap).where(eq(ap.id, applicationId)).limit(1);
  if (!row) throw new NotFoundError('Application', applicationId);

  if (row.applicantId !== ctx.actor.applicantId)
    throw new ForbiddenError('You can only accept your own job offer');

  if (row.status !== 'OFFER_EXTENDED')
    throw new ConflictError('Only OFFER_EXTENDED applications can be accepted');

  const [jobRow] = await db
    .select({ title: schema.jobs.title, companyId: schema.jobs.companyId })
    .from(schema.jobs)
    .where(eq(schema.jobs.id, row.jobId))
    .limit(1);

  const [userRow] = await db
    .select({ name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, ctx.actor.userId))
    .limit(1);

  const view = await runCommand(ctx, async ({ tx, audit }) => {
    // Row lock + machine check: a second, concurrent accept waits on the
    // lock, then fails the transition instead of double-filling a vacancy.
    const { to } = await lockAndTransitionApplication(tx, applicationId, 'APPLICANT_ACCEPT');
    const [updated] = await tx
      .update(ap)
      .set({ status: to, updatedAt: new Date() })
      .where(eq(ap.id, applicationId))
      .returning();
    if (!updated) throw new ConflictError('Only OFFER_EXTENDED applications can be accepted');

    // Fill one vacancy in the same transaction, under a row lock.
    const [job] = await tx
      .select({
        id: schema.jobs.id,
        status: schema.jobs.status,
        vacancies: schema.jobs.vacancies,
        vacanciesFilled: schema.jobs.vacanciesFilled,
      })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, row.jobId))
      .for('update');
    if (job) {
      const filled = job.vacanciesFilled + 1;
      const patch: Partial<typeof schema.jobs.$inferInsert> = {
        vacanciesFilled: filled,
        updatedAt: new Date(),
      };
      if (filled >= job.vacancies && (job.status === 'OPEN' || job.status === 'PAUSED')) {
        const check = jobMachine.check(job.status, 'FILL', {}, 'system');
        if (check.ok) {
          patch.status = check.to;
          patch.closedAt = new Date();
        }
      }
      await tx.update(schema.jobs).set(patch).where(eq(schema.jobs.id, job.id));
    }

    audit({
      action: 'application.applicant_accepted',
      entityType: 'application',
      entityId: applicationId,
      branchId: row.branchId,
      metadata: { jobId: row.jobId },
    });
    return updated!;
  }).then(buildView);

  // Notify employer company users
  if (jobRow?.companyId) {
    const jobTitle = jobRow.title;
    const applicantName = userRow?.name ?? 'The applicant';
    void notifyCompanyEmployers(db, jobRow.companyId, ({ userId }) => ({
      userId,
      type: 'OFFER_ACCEPTED' as const,
      title: `Offer accepted — ${jobTitle}`,
      body: `${applicantName} has accepted the offer for ${jobTitle}.`,
      data: { applicationId, jobTitle },
    })).catch(() => null);
  }

  return view;
}

// ─── Messages ──────────────────────────────────────────────────────────────

/** List all messages for an application. Accessible by employer, applicant, or match_case:read staff. */
export async function listMessages(actor: Actor, applicationId: string): Promise<MessageView[]>;
export async function listMessages(
  actor: Actor,
  applicationId: string,
  query: PlacementListQuery,
): Promise<{ items: MessageView[]; pagination: PaginationMeta }>;
export async function listMessages(
  actor: Actor,
  applicationId: string,
  query?: PlacementListQuery,
): Promise<MessageView[] | { items: MessageView[]; pagination: PaginationMeta }> {
  const [row] = await db.select().from(ap).where(eq(ap.id, applicationId)).limit(1);
  if (!row) throw new NotFoundError('Application', applicationId);

  // Access is ownership-first: an applicant sees only their own application,
  // an employer only their own company's jobs. Staff need match_case:read AND
  // city scope — holding the permission alone must never open every case.
  if (actor.applicantId != null) {
    if (actor.applicantId !== row.applicantId) {
      throw new ForbiddenError('You can only view messages for your own application');
    }
  } else if (actor.companyId != null) {
    // Verify employer's company owns the job (applies even to dual-role
    // accounts that also hold staff permissions).
    const [jobRow] = await db
      .select({ companyId: schema.jobs.companyId })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, row.jobId))
      .limit(1);
    if (!jobRow || jobRow.companyId !== actor.companyId)
      throw new ForbiddenError('Not authorised to view this application');
  } else if (hasPermission(actor, 'match_case:read')) {
    await assertCityAccess(actor, row.branchId, {
      entityType: 'application',
      entityId: row.id,
    });
  } else {
    throw new ForbiddenError('Not authorised to view this application');
  }

  // M32 — paginate when a query is passed; the dashboard callers still get
  // the full thread, as before.
  const where = eq(am.applicationId, applicationId);
  const [totalRow] = query
    ? await db.select({ total: count() }).from(am).where(where)
    : [{ total: 0 }];

  const base = db
    .select({
      id: am.id,
      applicationId: am.applicationId,
      senderId: am.senderId,
      senderRole: am.senderRole,
      content: am.content,
      createdAt: am.createdAt,
      senderName: schema.users.name,
    })
    .from(am)
    .innerJoin(schema.users, eq(schema.users.id, am.senderId))
    .where(where)
    .orderBy(asc(am.createdAt));
  const messages = query ? await base.limit(query.limit).offset(query.offset) : await base;

  const items = messages.map((m) => ({
    id: m.id,
    applicationId: m.applicationId,
    senderId: m.senderId,
    senderRole: m.senderRole as 'EMPLOYER' | 'APPLICANT',
    senderName: m.senderName ?? 'Unknown',
    content: m.content,
    createdAt: m.createdAt.toISOString(),
  }));
  if (!query) return items;
  return { items, pagination: paginationMeta(query, totalRow?.total ?? 0) };
}

/** Send a message on an application. Only EMPLOYER or APPLICANT can send. */
export async function sendMessage(
  ctx: SignedIn,
  applicationId: string,
  content: string,
): Promise<MessageView> {
  const [row] = await db.select().from(ap).where(eq(ap.id, applicationId)).limit(1);
  if (!row) throw new NotFoundError('Application', applicationId);

  if (row.status !== 'APPLICANT_REFUSED')
    throw new ConflictError('Chat is only available after the applicant refuses an offer');

  const [jobRow] = await db
    .select({ companyId: schema.jobs.companyId, title: schema.jobs.title })
    .from(schema.jobs)
    .where(eq(schema.jobs.id, row.jobId))
    .limit(1);

  // Determine sender role
  let senderRole: 'EMPLOYER' | 'APPLICANT';
  if (ctx.actor.applicantId === row.applicantId) {
    senderRole = 'APPLICANT';
  } else if (ctx.actor.companyId && jobRow?.companyId === ctx.actor.companyId) {
    senderRole = 'EMPLOYER';
  } else {
    throw new ForbiddenError('Only the applicant or employer can send messages');
  }

  const [userRow] = await db
    .select({ name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.id, ctx.actor.userId))
    .limit(1);

  const [msgRow] = await runCommand(ctx, async ({ tx, audit }) => {
    const inserted = await tx
      .insert(am)
      .values({
        applicationId,
        senderId: ctx.actor.userId,
        senderRole,
        content,
      })
      .returning();

    audit({
      action: 'application.message_sent',
      entityType: 'application',
      entityId: applicationId,
      branchId: row.branchId,
    });
    return inserted;
  });

  // Notify the other party
  if (senderRole === 'APPLICANT') {
    // Notify employer
    if (jobRow?.companyId) {
      void notifyCompanyEmployers(db, jobRow.companyId, ({ userId }) => ({
        userId,
        type: 'MESSAGE' as const,
        title: `New message — ${jobRow.title}`,
        body: 'The applicant sent a message regarding their refusal.',
        data: { applicationId },
      })).catch(() => null);
    }
  } else {
    // Notify applicant
    const [applicantRow] = await db
      .select({ userId: schema.applicants.userId })
      .from(schema.applicants)
      .where(eq(schema.applicants.id, row.applicantId))
      .limit(1);
    if (applicantRow) {
      void createNotification(db, {
        userId: applicantRow.userId,
        type: 'MESSAGE',
        title: `New message — ${jobRow?.title ?? 'your application'}`,
        body: 'The employer replied to your message.',
        data: { applicationId },
      }).catch(() => null);
    }
  }

  return {
    id: msgRow!.id,
    applicationId: msgRow!.applicationId,
    senderId: msgRow!.senderId,
    senderRole: msgRow!.senderRole as 'EMPLOYER' | 'APPLICANT',
    senderName: userRow?.name ?? 'Unknown',
    content: msgRow!.content,
    createdAt: msgRow!.createdAt.toISOString(),
  };
}
