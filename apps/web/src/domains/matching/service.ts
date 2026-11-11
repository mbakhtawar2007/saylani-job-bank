import 'server-only';
import { schema } from '@jobbank/db';
import type { JobStatus } from '@jobbank/shared';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { runCommand, type RequestContext } from '@/domains/shared/audit';
import type { Transaction } from '@/lib/db';
import { isReferrableApplicant, jobMachine } from '@/domains/job';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/domains/shared/errors';
import { enforceRateLimit } from '@/domains/shared/rate-limit';
import {
  assertBranchAccess,
  assertCityAccess,
  assertPermission,
  cityScope,
  hasPermission,
  type Actor,
} from '@/domains/shared/scope';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { sendMail, type MailMessage } from '@/lib/mail/mailer';
import { createNotification, notifyCompanyEmployers } from '@/domains/notifications';
import { lockAndTransitionApplication } from '@/domains/placement';
import {
  enqueueJobMatch,
  getLatestJobMatches,
  invalidateShortlistCache,
  type MatchesPage,
  type MatchTrigger,
} from './queries';

const j = schema.jobs;
const mr = schema.matchRuns;
const jm = schema.jobMatches;
const ap = schema.applicants;
const apn = schema.applications;
const us = schema.users;
const md = schema.masterData;

/** Review workflow states for a shortlisted applicant (schema enum). */
export const MATCH_REVIEW_STATUSES = [
  'NEW',
  'REVIEWED',
  'SHORTLISTED',
  'HIRED',
  'REJECTED',
] as const;
export type MatchReviewStatus = (typeof MATCH_REVIEW_STATUSES)[number];

export const OFFER_RESPONSES = ['ACCEPTED', 'DECLINED'] as const;
export type OfferResponse = (typeof OFFER_RESPONSES)[number];

/**
 * H19 — allowed review-status moves. HIRED and REJECTED are terminal: a
 * decision can no longer be flipped or resurrected, and NEW cannot jump
 * straight to HIRED (it goes through SHORTLISTED first). Notifications only
 * fire for a real transition now — previously they fired on no-op/reversal
 * transitions too, since nothing checked the current status.
 */
export const MATCH_REVIEW_TRANSITIONS: Record<MatchReviewStatus, MatchReviewStatus[]> = {
  NEW: ['REVIEWED', 'SHORTLISTED', 'REJECTED'],
  REVIEWED: ['SHORTLISTED', 'REJECTED'],
  SHORTLISTED: ['HIRED', 'REJECTED'],
  HIRED: [],
  REJECTED: [],
};

/** Employer sees only their own company's job; staff are branch-scoped. */
async function loadJobForActor(actor: Actor, jobId: string) {
  const [job] = await db
    .select({
      id: j.id,
      companyId: j.companyId,
      branchId: j.branchId,
      status: j.status,
      title: j.title,
    })
    .from(j)
    .where(eq(j.id, jobId))
    .limit(1);
  if (!job) throw new NotFoundError('Job', jobId);

  if (actor.roles.includes('EMPLOYER')) {
    // Employers see only their own company's jobs — a job referred to
    // another company (or to no company) is a 404 for them.
    if (actor.companyId !== job.companyId) {
      throw new NotFoundError('Job', jobId);
    }
  } else {
    assertBranchAccess(actor, job.branchId, { entityType: 'job', entityId: job.id });
  }
  return job;
}

/** REJECTION_REASON / REFUSAL_REASON code check against active master data. */
export async function requireReasonCode(
  type: 'REJECTION_REASON' | 'REFUSAL_REASON',
  code: string | undefined,
  note: string | undefined,
): Promise<{ code: string; label: string }> {
  if (!code) {
    throw new ValidationError([{ path: 'reasonCode', message: 'Choose a reason' }]);
  }
  const [row] = await db
    .select({ code: md.code, label: md.label, meta: md.meta })
    .from(md)
    .where(and(eq(md.type, type), eq(md.code, code), eq(md.isActive, true)))
    .limit(1);
  if (!row) {
    throw new ValidationError([{ path: 'reasonCode', message: 'Unknown reason' }]);
  }
  const trimmed = note?.trim() ?? '';
  if ((row.meta as { requiresNote?: boolean }).requiresNote && trimmed.length < 5) {
    throw new ValidationError([
      { path: 'note', message: 'Add a short note for this reason (at least 5 characters)' },
    ]);
  }
  return { code: row.code, label: row.label };
}

const appUrl = (path: string) => new URL(path, env.NEXT_PUBLIC_APP_URL).toString();

/** Best-effort decision email; a failure is logged by the mailer, never thrown here. */
function sendDecisionEmail(
  ctx: RequestContext,
  to: string | null,
  message: Omit<MailMessage, 'to'>,
): void {
  if (!to) return;
  void sendMail({ to, ...message }).catch((err) => {
    ctx.log.error('match decision email failed', { to, subject: message.subject, err });
  });
}

export async function getJobMatches(
  actor: Actor,
  jobId: string,
  opts: { page: number; pageSize: number },
): Promise<MatchesPage> {
  assertPermission(actor, 'match_case:read');
  await loadJobForActor(actor, jobId);
  return getLatestJobMatches(db, jobId, opts);
}

/** Manual recalculation: enqueue an event; the Python worker rebuilds the shortlist. */
export async function requestJobMatchesRefresh(
  ctx: RequestContext & { actor: Actor },
  jobId: string,
): Promise<{ queued: true }> {
  if (
    !hasPermission(ctx.actor, 'match_case:manage') &&
    !hasPermission(ctx.actor, 'job:manage_own')
  ) {
    throw new ForbiddenError();
  }
  // The route comment used to claim this was rate-limited by the API layer; it
  // was not. Each refresh enqueues a Python worker run, so cap it per actor+job.
  await enforceRateLimit('match-refresh', `${ctx.actor.userId}:${jobId}`, {
    limit: 5,
    windowSeconds: 60,
  });
  const job = await loadJobForActor(ctx.actor, jobId);
  if (job.status !== 'OPEN') {
    throw new ForbiddenError('Only open jobs can be re-matched');
  }

  await runCommand(ctx, async ({ tx, audit }) => {
    await enqueueJobMatch(tx, jobId, 'MANUAL' satisfies MatchTrigger);
    audit({ action: 'match.refresh', entityType: 'job', entityId: jobId });
  });
  return { queued: true };
}

export interface MatchDecisionInput {
  reviewStatus: MatchReviewStatus;
  /** Required when reviewStatus = REJECTED (master-data REJECTION_REASON code). */
  reasonCode?: string;
  /** Optional context; mandatory for reasons whose meta.requiresNote is true. */
  note?: string;
}

/**
 * C3 — match-side hire sync. Runs inside the decision transaction, under the
 * job-row lock taken by setJobMatchReviewStatus.
 *
 * A HIRED match decision is a hire, not just a label: the application (when
 * one exists for this job + applicant) becomes HIRED, one vacancy fills, and
 * the job becomes FILLED when the last vacancy fills (machine FILL event).
 *
 * No double-fill: when the application is already HIRED — e.g. the applicant
 * accepted a placement offer via acceptJobOffer (7ee4e4d) before this match
 * decision — the vacancy was already filled by that path, so this one only
 * syncs the label and returns false. When no application exists at all, the
 * match itself is the hire signal and the vacancy still fills.
 *
 * C3/H19 (2026-11-08): the boolean returned here is persisted on the match
 * row as vacancy_filled (see setJobMatchReviewStatus). If the applicant
 * later declines this offer via respondToJobOffer, the vacancy filled here
 * IS rolled back and the application mirrors back to APPLICANT_REFUSED —
 * placement owns the offer truth, the match row only mirrors it. The hire
 * counts exclude declined offers, so the chart stays right too.
 */
async function syncMatchHire(
  tx: Transaction,
  jobId: string,
  applicantId: string,
  job: { id: string; status: JobStatus; vacancies: number; vacanciesFilled: number },
): Promise<boolean> {
  const [application] = await tx
    .select({ id: apn.id, status: apn.status })
    .from(apn)
    .where(and(eq(apn.jobId, jobId), eq(apn.applicantId, applicantId)))
    .for('update');
  const filledByUs = !application || application.status !== 'HIRED';
  if (application && application.status !== 'HIRED') {
    await tx
      .update(apn)
      .set({ status: 'HIRED', updatedAt: new Date() })
      .where(eq(apn.id, application.id));
  }
  if (!filledByUs) return false;

  const filled = job.vacanciesFilled + 1;
  const patch: Partial<typeof j.$inferInsert> = {
    vacanciesFilled: filled,
    updatedAt: new Date(),
  };
  if (filled >= job.vacancies) {
    const check = jobMachine.check(job.status, 'FILL', {}, 'system');
    if (check.ok) {
      patch.status = check.to;
      patch.closedAt = new Date();
    }
  }
  await tx.update(j).set(patch).where(eq(j.id, job.id));
  return true;
}

/**
 * Employer/staff decision on one shortlisted applicant (latest completed run).
 * Allowed for staff (`match_case:manage`) and the owning employer
 * (`decision:employer`). REJECTED persists a reason and the applicant is
 * notified in-app (+ best-effort email).
 */
export async function setJobMatchReviewStatus(
  ctx: RequestContext & { actor: Actor },
  jobId: string,
  applicantId: string,
  input: MatchDecisionInput,
): Promise<{ reviewStatus: MatchReviewStatus; reasonCode: string | null }> {
  if (
    !hasPermission(ctx.actor, 'match_case:manage') &&
    !hasPermission(ctx.actor, 'decision:employer')
  ) {
    throw new ForbiddenError();
  }
  const job = await loadJobForActor(ctx.actor, jobId);

  const reason =
    input.reviewStatus === 'REJECTED'
      ? await requireReasonCode('REJECTION_REASON', input.reasonCode, input.note)
      : null;
  const note = input.note?.trim() || null;

  await runCommand(ctx, async ({ tx, audit }) => {
    // Lock the job row first: the OPEN check and the vacancy fill below must
    // see the same state, and concurrent HIRED decisions on one job must
    // serialise on this lock (vacanciesFilled <= vacancies is a DB check).
    const [lockedJob] = await tx
      .select({
        id: j.id,
        status: j.status,
        vacancies: j.vacancies,
        vacanciesFilled: j.vacanciesFilled,
      })
      .from(j)
      .where(eq(j.id, jobId))
      .for('update');
    if (!lockedJob) throw new NotFoundError('Job', jobId);
    // H19: decisions only happen on open jobs — never on CLOSED / FILLED /
    // EXPIRED ones.
    if (lockedJob.status !== 'OPEN') {
      throw new ConflictError('Only open jobs can be reviewed');
    }

    const [latestRun] = await tx
      .select({ id: mr.id })
      .from(mr)
      .where(and(eq(mr.jobId, jobId), eq(mr.status, 'COMPLETED')))
      .orderBy(desc(mr.createdAt))
      .limit(1);
    if (!latestRun) throw new NotFoundError('Match run', jobId);

    const [match] = await tx
      .select({ id: jm.id, reviewStatus: jm.reviewStatus })
      .from(jm)
      .where(and(eq(jm.runId, latestRun.id), eq(jm.applicantId, applicantId)))
      .for('update');
    if (!match) throw new NotFoundError('Match', applicantId);

    // H19: enforce the transition table.
    const allowed = MATCH_REVIEW_TRANSITIONS[match.reviewStatus] ?? [];
    if (!allowed.includes(input.reviewStatus)) {
      throw new ConflictError(
        `Cannot move a match from ${match.reviewStatus} to ${input.reviewStatus}`,
      );
    }

    // C3: a HIRED decision needs a free vacancy, checked under the job lock.
    const hiring = input.reviewStatus === 'HIRED';
    if (hiring && lockedJob.vacanciesFilled >= lockedJob.vacancies) {
      throw new ConflictError('This job has no open vacancies');
    }

    // H19 (2026-11-08): placement owns the offer truth, so a match HIRED
    // must not resurrect an application placement already closed as
    // refused/rejected. The match decision reads the placement state first;
    // a refused candidate stays refused even if the match shortlist says
    // otherwise. (The reverse direction — a match HIRED syncing the
    // application to HIRED — is syncMatchHire below.)
    if (hiring) {
      const [placementApplication] = await tx
        .select({ status: apn.status })
        .from(apn)
        .where(and(eq(apn.jobId, jobId), eq(apn.applicantId, applicantId)))
        .limit(1);
      if (
        placementApplication &&
        (placementApplication.status === 'APPLICANT_REFUSED' ||
          placementApplication.status === 'EMPLOYER_REJECTED' ||
          placementApplication.status === 'REJECTED')
      ) {
        throw new ConflictError(
          'This candidate already declined or was rejected for this job — the placement decision stands',
        );
      }
    }

    const updated = await tx
      .update(jm)
      .set({
        reviewStatus: input.reviewStatus,
        reviewReasonCode: reason?.code ?? null,
        reviewNote: note,
        reviewedBy: ctx.actor.userId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(jm.id, match.id))
      .returning({ id: jm.id });
    if (updated.length === 0) throw new NotFoundError('Match', applicantId);

    // C3: a HIRED match decision is a hire — sync the application, fill one
    // vacancy, and FILL the job when the last vacancy fills.
    const vacancyFilled = hiring ? await syncMatchHire(tx, jobId, applicantId, lockedJob) : null;
    // C3/H19: persist whether THIS decision filled a vacancy on the match
    // row, so the decline path can tell a match-filled vacancy (free it)
    // from a placement-filled one (leave it alone). See job_matches.
    // vacancy_filled and respondToJobOffer.
    if (hiring) {
      await tx
        .update(jm)
        .set({ vacancyFilled: vacancyFilled ?? false, updatedAt: new Date() })
        .where(eq(jm.id, match.id));
    }

    audit({
      action: 'match.review_status',
      entityType: 'job_match',
      entityId: jobId,
      metadata: {
        applicant_id: applicantId,
        review_status: input.reviewStatus,
        reason_code: reason?.code ?? null,
        note,
        ...(hiring ? { vacancy_filled: vacancyFilled } : {}),
      },
    });
  });
  // Cached shortlist pages still show the old status — drop them (TTL would
  // cover it too, but an explicit invalidation keeps the UI instant).
  await invalidateShortlistCache(jobId);

  // Applicant-facing notification (post-commit so the row is visible even if
  // the notification insert fails — notifications must never block a decision).
  if (
    input.reviewStatus === 'SHORTLISTED' ||
    input.reviewStatus === 'HIRED' ||
    input.reviewStatus === 'REJECTED'
  ) {
    await notifyApplicantOfDecision(ctx, job, applicantId, input.reviewStatus, reason, note);
  }
  return { reviewStatus: input.reviewStatus, reasonCode: reason?.code ?? null };
}

async function notifyApplicantOfDecision(
  ctx: RequestContext & { actor: Actor },
  job: { id: string; title: string },
  applicantId: string,
  reviewStatus: 'SHORTLISTED' | 'HIRED' | 'REJECTED',
  reason: { code: string; label: string } | null,
  note: string | null,
): Promise<void> {
  try {
    const contact = await db
      .select({ userId: us.id, email: us.email, fullName: ap.fullName })
      .from(ap)
      .innerJoin(us, eq(us.id, ap.userId))
      .where(eq(ap.id, applicantId))
      .limit(1);
    const target = contact[0];
    if (!target) return;

    const copy = {
      SHORTLISTED: {
        type: 'MATCH_SHORTLISTED' as const,
        title: `Shortlisted for ${job.title}`,
        body: 'The employer shortlisted you. Job Bank staff will contact you about the next steps.',
      },
      HIRED: {
        type: 'MATCH_HIRED' as const,
        title: `Selected for ${job.title}`,
        body: 'Congratulations — the employer selected you. Your Job Bank branch will guide you through onboarding.',
      },
      REJECTED: {
        type: 'MATCH_REJECTED' as const,
        title: `Update on ${job.title}`,
        body: reason
          ? `The employer moved on with other candidates. Reason: ${reason.label}${note ? ` — ${note}` : ''}.`
          : 'The employer moved on with other candidates.',
      },
    }[reviewStatus];

    await createNotification(db, {
      userId: target.userId,
      type: copy.type,
      title: copy.title,
      body: copy.body,
      data: {
        jobId: job.id,
        jobTitle: job.title,
        applicantId,
        reasonCode: reason?.code ?? null,
        reasonLabel: reason?.label ?? null,
        note,
      },
    });

    if (target.email) {
      sendDecisionEmail(ctx, target.email, {
        subject: `${copy.title} — Saylani Job Bank`,
        text: `Assalam-o-Alaikum ${target.fullName ?? ''},\n\n${copy.body}\n\nOpen your dashboard: ${appUrl('/applicant/notifications')}\n\n— Saylani Job Bank`,
        html: `<p>Assalam-o-Alaikum ${target.fullName ?? ''},</p><p>${copy.body}</p><p><a href="${appUrl('/applicant/notifications')}">Open your dashboard</a></p><p>— Saylani Job Bank</p>`,
      });
    }
  } catch (err) {
    ctx.log.error('match decision notification failed', { jobId: job.id, applicantId, err });
  }
}

/**
 * C3/H19 — unwind a match-filled hire when the applicant declines the match
 * offer. Only ever called when the match row's vacancy_filled flag is set,
 * i.e. this match's HIRED decision filled the vacancy (syncMatchHire).
 *
 * Guards: the job row is locked FOR UPDATE and vacanciesFilled never drops
 * below 0; a FILLED job whose vacancy frees re-opens via the job machine's
 * UNFILL event (closedAt cleared); the flag is consumed (set false) so the
 * same decline can never free twice. The placement application mirrors
 * HIRED → APPLICANT_REFUSED through the placement machine — placement owns
 * the offer truth, the match row only mirrors it. An application this match
 * did not hire (e.g. still OFFER_EXTENDED, which never filled a vacancy)
 * is left untouched.
 */
async function freeVacancyForDeclinedMatchOffer(
  tx: Transaction,
  jobId: string,
  applicantId: string,
  matchId: string,
  reason: { code: string; label: string } | null,
): Promise<boolean> {
  const [application] = await tx
    .select({ id: apn.id, status: apn.status })
    .from(apn)
    .where(and(eq(apn.jobId, jobId), eq(apn.applicantId, applicantId)))
    .for('update');
  if (application && application.status === 'HIRED') {
    const { to } = await lockAndTransitionApplication(
      tx,
      application.id,
      'OFFER_DECLINED_AFTER_HIRE',
    );
    await tx
      .update(apn)
      .set({
        status: to,
        applicantRefusalReason: reason?.label ?? null,
        applicantRefusedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(apn.id, application.id));
  }

  const [job] = await tx
    .select({
      id: j.id,
      status: j.status,
      vacancies: j.vacancies,
      vacanciesFilled: j.vacanciesFilled,
    })
    .from(j)
    .where(eq(j.id, jobId))
    .for('update');
  if (!job || job.vacanciesFilled <= 0) return false;
  const freed = job.vacanciesFilled - 1;
  const patch: Partial<typeof j.$inferInsert> = {
    vacanciesFilled: freed,
    updatedAt: new Date(),
  };
  if (job.status === 'FILLED') {
    const check = jobMachine.check(job.status, 'UNFILL', {}, 'system');
    if (check.ok) {
      patch.status = check.to;
      patch.closedAt = null;
    }
  }
  await tx.update(j).set(patch).where(eq(j.id, job.id));
  // Consume the flag: this vacancy is freed exactly once.
  await tx
    .update(jm)
    .set({ vacancyFilled: false, updatedAt: new Date() })
    .where(eq(jm.id, matchId));
  return true;
}

export interface OfferResponseInput {
  applicantResponse: OfferResponse;
  /** Required when applicantResponse = DECLINED (master-data REFUSAL_REASON code). */
  reasonCode?: string;
  note?: string;
}

/**
 * Applicant answers a HIRED decision on their own match (offer accept/decline).
 * Declining requires a REFUSAL_REASON; the employer is notified either way.
 *
 * C3/H19 (2026-11-08): a DECLINED answer unwinds the hire this match made —
 * the vacancy frees (FILLED → OPEN when it was the last one) and the
 * placement application mirrors back to APPLICANT_REFUSED, because placement
 * owns the offer truth. Only when this match's HIRED decision filled the
 * vacancy (job_matches.vacancy_filled); a placement accept that filled it
 * first is not this match's to unwind.
 */
export async function respondToJobOffer(
  ctx: RequestContext & { actor: Actor },
  jobId: string,
  input: OfferResponseInput,
): Promise<{ applicantResponse: OfferResponse }> {
  assertPermission(ctx.actor, 'decision:applicant');
  const applicantId = ctx.actor.applicantId;
  if (!applicantId) throw new ForbiddenError('No applicant profile on this account');
  // Audit 2026-11-11 (L-20): an offer response notifies the employer —
  // 10 per applicant per hour is plenty (one response per offer).
  await enforceRateLimit(
    'offer-response',
    applicantId,
    { limit: 10, windowSeconds: 3600 },
    'Too many offer responses. Try again in an hour.',
  );

  const reason =
    input.applicantResponse === 'DECLINED'
      ? await requireReasonCode('REFUSAL_REASON', input.reasonCode, input.note)
      : null;

  const [job] = await db
    .select({ id: j.id, title: j.title, companyId: j.companyId })
    .from(j)
    .where(eq(j.id, jobId))
    .limit(1);
  if (!job) throw new NotFoundError('Job', jobId);

  await runCommand(ctx, async ({ tx, audit }) => {
    const [latestRun] = await tx
      .select({ id: mr.id })
      .from(mr)
      .where(and(eq(mr.jobId, jobId), eq(mr.status, 'COMPLETED')))
      .orderBy(desc(mr.createdAt))
      .limit(1);
    if (!latestRun) throw new NotFoundError('Match run', jobId);

    const [existing] = await tx
      .select({
        id: jm.id,
        reviewStatus: jm.reviewStatus,
        applicantResponse: jm.applicantResponse,
        vacancyFilled: jm.vacancyFilled,
      })
      .from(jm)
      .where(and(eq(jm.runId, latestRun.id), eq(jm.applicantId, applicantId)))
      .limit(1);
    if (!existing) throw new NotFoundError('Match', applicantId);
    if (existing.reviewStatus !== 'HIRED') {
      throw new ConflictError('There is no offer to answer on this job');
    }
    if (existing.applicantResponse) {
      throw new ConflictError('You have already answered this offer');
    }

    await tx
      .update(jm)
      .set({
        applicantResponse: input.applicantResponse,
        refusalReasonCode: reason?.code ?? null,
        respondedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(jm.id, existing.id));

    // C3/H19: a decline unwinds the hire this match made — but only when
    // this match's HIRED decision filled the vacancy (vacancy_filled). A
    // placement accept that filled it first leaves the flag false, and the
    // vacancy stays filled: the applicant accepted that offer, the match
    // answer does not un-hire them. The second-answer guard above already
    // blocks a repeat decline; the flag is consumed inside as well.
    let vacancyFreed = false;
    if (input.applicantResponse === 'DECLINED' && existing.vacancyFilled) {
      vacancyFreed = await freeVacancyForDeclinedMatchOffer(
        tx,
        jobId,
        applicantId,
        existing.id,
        reason,
      );
    }

    audit({
      action: 'match.offer_response',
      entityType: 'job_match',
      entityId: jobId,
      metadata: {
        applicant_id: applicantId,
        response: input.applicantResponse,
        reason_code: reason?.code ?? null,
        ...(input.applicantResponse === 'DECLINED' ? { vacancy_freed: vacancyFreed } : {}),
      },
    });
  });

  if (job.companyId) {
    try {
      const [applicant] = await db
        .select({ fullName: ap.fullName })
        .from(ap)
        .where(eq(ap.id, applicantId))
        .limit(1);
      const name = applicant?.fullName ?? 'An applicant';
      const accepted = input.applicantResponse === 'ACCEPTED';
      await notifyCompanyEmployers(db, job.companyId, ({ userId }) => ({
        userId,
        type: accepted ? 'OFFER_ACCEPTED' : 'OFFER_DECLINED',
        title: accepted ? `${name} accepted your offer` : `${name} declined your offer`,
        body: accepted
          ? `${job.title} — coordinate onboarding through the Job Bank branch.`
          : `${job.title}${reason ? ` — reason: ${reason.label}` : ''}. The shortlist is open again.`,
        data: {
          jobId: job.id,
          jobTitle: job.title,
          applicantId,
          response: input.applicantResponse,
          reasonCode: reason?.code ?? null,
          reasonLabel: reason?.label ?? null,
        },
      }));
    } catch (err) {
      ctx.log.error('offer response notification failed', { jobId, applicantId, err });
    }
  }
  return { applicantResponse: input.applicantResponse };
}

// ─── Applicant job-matches view ───────────────────────────────────────────

export type MatchStrength = 'GREAT' | 'GOOD' | 'POSSIBLE';

export interface MatchedJob {
  jobId: string;
  title: string;
  strength: MatchStrength;
  score: number;
  matchReasons: string[];
  jobType: string;
  shift: string;
  salaryMin: number | null;
  salaryMax: number | null;
  publishedAt: string | null;
}

function scoreToStrength(score: number): MatchStrength {
  if (score >= 75) return 'GREAT';
  if (score >= 50) return 'GOOD';
  return 'POSSIBLE';
}

/**
 * Returns all jobs from the latest completed match run for this applicant,
 * ordered best-score first. Intended for the applicant's job-matches page.
 */
export async function listMatchedJobs(profile: { id: string }): Promise<MatchedJob[]> {
  const rows = await db
    .select({
      jobId: jm.jobId,
      title: j.title,
      score: jm.score,
      summary: jm.summary,
      jobType: j.jobType,
      shift: j.shift,
      salaryMin: j.salaryMin,
      salaryMax: j.salaryMax,
      publishedAt: j.publishedAt,
    })
    .from(jm)
    .innerJoin(mr, eq(mr.id, jm.runId))
    .innerJoin(j, and(eq(j.id, jm.jobId), eq(j.status, 'OPEN')))
    .where(and(eq(jm.applicantId, profile.id), eq(mr.status, 'COMPLETED')))
    .orderBy(desc(mr.createdAt), desc(jm.score));

  // One entry per job: keep the row from the most recent run. Runs are
  // ordered by run date first, so the first occurrence for each jobId is the
  // latest — previously score was the primary sort, which kept the
  // highest-scoring row across all runs instead (M27).
  const seen = new Set<string>();
  const out: MatchedJob[] = [];
  for (const row of rows) {
    if (seen.has(row.jobId)) continue;
    seen.add(row.jobId);
    const score = row.score ?? 0;
    out.push({
      jobId: row.jobId,
      title: row.title,
      strength: scoreToStrength(score),
      score,
      matchReasons: row.summary
        ? row.summary
            .split(/\.\s+/)
            .map((s) => s.replace(/\.$/, '').trim())
            .filter(Boolean)
            .slice(0, 5)
        : [],
      jobType: row.jobType,
      shift: row.shift,
      salaryMin: row.salaryMin ?? null,
      salaryMax: row.salaryMax ?? null,
      publishedAt: row.publishedAt?.toISOString() ?? null,
    });
  }
  return out;
}

export interface StaffMatchedJob extends MatchedJob {
  companyName: string | null;
  /** True when this job was already referred to this applicant. */
  referred: boolean;
}

/**
 * Staff view of one applicant's AI-ranked jobs, for referral.
 *
 * Reuses the applicant's own ranked list (latest COMPLETED match run, OPEN
 * jobs only, best score first — no score is invented here) and then applies
 * the same guards as referJobToApplicant: the applicant must be referrable,
 * the job must be in the staff member's city scope, and the posting company
 * must be VERIFIED. Already-referred jobs stay in the list, flagged, so
 * staff can see what was already sent instead of re-sending it blindly.
 * Returns [] when the applicant cannot be referred at all.
 *
 * Audit 2026-11-11 (M-14): ported from the fork clone's uncommitted
 * matched-jobs work (mbakhtawar2007/saylani-job-bank, local clone only).
 */
export async function listMatchedJobsForStaff(
  actor: Actor,
  applicantId: string,
): Promise<StaffMatchedJob[]> {
  assertPermission(actor, 'job:refer');
  const [applicant] = await db
    .select({
      id: ap.id,
      status: ap.status,
      identityStatus: ap.identityStatus,
      branchId: ap.branchId,
    })
    .from(ap)
    .where(eq(ap.id, applicantId));
  if (!applicant) throw new NotFoundError('Applicant', applicantId);
  await assertCityAccess(actor, applicant.branchId, {
    entityType: 'applicant',
    entityId: applicant.id,
  });
  if (!isReferrableApplicant(applicant)) return [];

  const base = await listMatchedJobs({ id: applicantId });
  if (base.length === 0) return [];
  const jobIds = base.map((b) => b.jobId);

  const scope = cityScope(actor, j.branchId);
  const jobRows = await db
    .select({
      jobId: j.id,
      companyName: schema.companies.legalName,
    })
    .from(j)
    .innerJoin(schema.companies, eq(schema.companies.id, j.companyId))
    .where(and(inArray(j.id, jobIds), eq(schema.companies.status, 'VERIFIED'), scope ?? undefined));
  const byId = new Map(jobRows.map((r) => [r.jobId, r]));

  const referredRows = await db
    .select({ jobId: schema.jobApplicantReferrals.jobId })
    .from(schema.jobApplicantReferrals)
    .where(
      and(
        eq(schema.jobApplicantReferrals.applicantId, applicantId),
        inArray(schema.jobApplicantReferrals.jobId, jobIds),
      ),
    );
  const referred = new Set(referredRows.map((r) => r.jobId));

  return base
    .filter((b) => byId.has(b.jobId))
    .slice(0, 10)
    .map((b) => ({
      ...b,
      companyName: byId.get(b.jobId)?.companyName ?? null,
      referred: referred.has(b.jobId),
    }));
}

/** Reason dropdown options for the applicant's offer-response UI. */
export async function listRefusalReasons(): Promise<
  { code: string; label: string; requiresNote: boolean }[]
> {
  const rows = await db
    .select({ code: md.code, label: md.label, meta: md.meta })
    .from(md)
    .where(and(eq(md.type, 'REFUSAL_REASON'), eq(md.isActive, true)))
    .orderBy(md.sortOrder, md.label);
  return rows.map((r) => ({
    code: r.code,
    label: r.label,
    requiresNote: Boolean((r.meta as { requiresNote?: boolean }).requiresNote),
  }));
}

/** Reason dropdown options for the employer's reject action. */
export async function listRejectionReasons(): Promise<
  { code: string; label: string; requiresNote: boolean }[]
> {
  const rows = await db
    .select({ code: md.code, label: md.label, meta: md.meta })
    .from(md)
    .where(and(eq(md.type, 'REJECTION_REASON'), eq(md.isActive, true)))
    .orderBy(md.sortOrder, md.label);
  return rows.map((r) => ({
    code: r.code,
    label: r.label,
    requiresNote: Boolean((r.meta as { requiresNote?: boolean }).requiresNote),
  }));
}

export interface PendingOffer {
  jobId: string;
  jobTitle: string;
  score: number | null;
  hiredAt: Date | null;
}

/** HIRED decisions on the applicant's latest-run matches that they have not answered yet. */
export async function getMyPendingOffers(actor: Actor): Promise<PendingOffer[]> {
  assertPermission(actor, 'match_case:read');
  if (!actor.applicantId) return [];

  const rows = await db
    .select({ jobId: jm.jobId, jobTitle: j.title, score: jm.score, hiredAt: jm.reviewedAt })
    .from(jm)
    .innerJoin(mr, eq(mr.id, jm.runId))
    .innerJoin(j, eq(j.id, jm.jobId))
    .where(
      and(
        eq(jm.applicantId, actor.applicantId),
        eq(jm.reviewStatus, 'HIRED'),
        isNull(jm.applicantResponse),
        eq(mr.status, 'COMPLETED'),
      ),
    )
    .orderBy(desc(mr.createdAt));

  // One row per job (the latest completed run wins).
  const seen = new Set<string>();
  const offers: PendingOffer[] = [];
  for (const row of rows) {
    if (seen.has(row.jobId)) continue;
    seen.add(row.jobId);
    offers.push({
      jobId: row.jobId,
      jobTitle: row.jobTitle,
      score: row.score,
      hiredAt: row.hiredAt,
    });
  }
  return offers;
}
