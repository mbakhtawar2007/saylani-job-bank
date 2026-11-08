'server-only';
// Employer-side interview scheduling, decisions, applicant refusal, and chat.

import { schema } from '@jobbank/db';
import { and, asc, eq, or } from 'drizzle-orm';
import { z } from 'zod';
import { runCommand } from '@/domains/shared/audit';
import { ConflictError, ForbiddenError, NotFoundError } from '@/domains/shared/errors';
import {
  assertCityAccess,
  assertPermission,
  hasPermission,
  type Actor,
} from '@/domains/shared/scope';
import { jobMachine } from '@/domains/job';
import { db } from '@/lib/db';
import { createNotification, notifyCompanyEmployers } from '@/domains/notifications';
import type { RequestContext } from '@/domains/shared/audit';
import { buildView, type ApplicationView, type ApplicationStatus } from './index';
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
  interviewAt: z.string().datetime(),
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

export const updateEmployerInterviewStatusSchema = z.object({
  status: z.enum(EMPLOYER_INTERVIEW_UPDATE_STATUSES),
  interviewAt: z.string().datetime().optional(),
  interviewLocation: z.string().trim().max(300).optional(),
  interviewNote: z.string().trim().max(500).optional(),
});
export type UpdateEmployerInterviewStatusInput = z.infer<
  typeof updateEmployerInterviewStatusSchema
>;

export const EMPLOYER_DECISION_OPTIONS = ['HOLD', 'ACCEPTED', 'REJECTED'] as const;
export type EmployerDecisionOption = (typeof EMPLOYER_DECISION_OPTIONS)[number];

export const recordEmployerDecisionSchema = z.object({
  decision: z.enum(EMPLOYER_DECISION_OPTIONS),
  note: z.string().trim().max(500).optional(),
});
export type RecordEmployerDecisionInput = z.infer<typeof recordEmployerDecisionSchema>;

export const refuseJobOfferSchema = z.object({
  reason: z.string().trim().min(3).max(500),
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
    phone: phone[0]?.phone ?? null,
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

const EMPLOYER_VISIBLE_STATUSES: ApplicationStatus[] = [
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

/** Employer: list all referred candidates for their company's jobs. */
export async function listReferrals(actor: Actor): Promise<ApplicationView[]> {
  assertPermission(actor, 'decision:employer');
  if (!actor.companyId) return [];

  const companyJobs = await db
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .where(eq(schema.jobs.companyId, actor.companyId));

  if (companyJobs.length === 0) return [];

  const jobIds = companyJobs.map((j) => j.id);

  const rows = await db
    .select()
    .from(ap)
    .where(
      and(
        or(...jobIds.map((id) => eq(ap.jobId, id))),
        or(...EMPLOYER_VISIBLE_STATUSES.map((s) => eq(ap.status, s))),
      ),
    );

  return Promise.all(rows.map(buildView));
}

/** Employer: get full application + applicant summary for one referred candidate. */
export async function getApplicationForEmployer(
  actor: Actor,
  applicationId: string,
): Promise<ApplicationWithApplicant> {
  assertPermission(actor, 'decision:employer');
  const row = await assertEmployerOwnsApplication(actor, applicationId);
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
      type: 'INTERVIEW_RESCHEDULED',
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
    type NotifType = 'OFFER_ACCEPTED' | 'OFFER_DECLINED' | 'MATCH_REJECTED';
    const notifType: NotifType =
      input.decision === 'ACCEPTED'
        ? 'OFFER_ACCEPTED'
        : input.decision === 'REJECTED'
          ? 'MATCH_REJECTED'
          : 'OFFER_DECLINED';

    const copy: Record<NotifType, { title: string; body: string }> = {
      OFFER_ACCEPTED: {
        title: `Job offer — ${jobTitle}`,
        body: `You have received a job offer from ${companyName} for ${jobTitle}. Please respond via your dashboard.`,
      },
      OFFER_DECLINED: {
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
        applicantRefusalReason: input.reason,
        applicantRefusedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(ap.id, applicationId))
      .returning();

    // Open chat with first message from applicant
    const content = `I have refused this offer. Reason: ${input.reason}${input.note ? '. ' + input.note : ''}`;
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
      metadata: { reason: input.reason },
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
export async function listMessages(actor: Actor, applicationId: string): Promise<MessageView[]> {
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

  const messages = await db
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
    .where(eq(am.applicationId, applicationId))
    .orderBy(asc(am.createdAt));

  return messages.map((m) => ({
    id: m.id,
    applicationId: m.applicationId,
    senderId: m.senderId,
    senderRole: m.senderRole as 'EMPLOYER' | 'APPLICANT',
    senderName: m.senderName ?? 'Unknown',
    content: m.content,
    createdAt: m.createdAt.toISOString(),
  }));
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
        type: 'OFFER_DECLINED' as const,
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
        type: 'OFFER_DECLINED',
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
