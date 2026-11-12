/* Ported from Najam (2026-11-11). Adaptations: job inserts/bodies use ROTATING +
 * shiftHours (rotation-only postings); direct applicant inserts carry this repo's
 * registration columns; the 'keeps candidates hidden' test is flipped — this repo's
 * 2026-11-10 rule shows referred candidates in full to the employer (no masking).
 * Employer decisions were REMOVED 2026-11-12 (Step 2): the employer-decision
 * endpoint hard-403s every actor acting as an employer — including staff acting
 * on an employer's behalf, which resolves to the EMPLOYER role — so the
 * decision tests below assert the refusal, not a recorded decision. Staff
 * match-review is a separate path (matching service) and is unaffected.
 * REJECTED still needs evidence (note >= 5 chars, M19), and match-shortlist
 * decisions are NOT recorded in employer_decisions here (matching change left out). */
import { schema } from '@jobbank/db';
import { and, eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as decide } from '@/app/api/v1/applications/[id]/employer-decision/route';
import { GET as messages } from '@/app/api/v1/applications/[id]/messages/route';
import { POST as createJob } from '@/app/api/v1/jobs/me/route';
import { GET as listBranches } from '@/app/api/v1/branches/route';
import { loadActor } from '@/domains/auth';
import { getApplicationForEmployer } from '@/domains/placement';
import { resetMemoryRateLimits } from '@/domains/shared/rate-limit';
import { db } from '@/lib/db';
import { call, type Jar, owner, randomPhone, signIn, signInApplicant } from '@/test/api-client';
import { actingForEmployer, listManagedEmployers } from './act-for-employer';

const HEADER = 'x-jb-on-behalf-of-company';
const ON_BEHALF = (companyId: string): Record<string, string> => ({ [HEADER]: companyId });

let companyId: string;
let branchId: string;
let staffKhiId: string;
let staffLhrId: string;
let employerId: string;
let staffKhi: Jar;
let staffLhr: Jar;
let employer: Jar;

const userId = async (email: string) =>
  (
    await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email))
  )[0]!.id;

beforeAll(async () => {
  staffKhi = await signIn('staff.khi@jobbank.local');
  staffLhr = await signIn('staff.lhr@jobbank.local');
  employer = await signIn('employer@jobbank.local');
  staffKhiId = await userId('staff.khi@jobbank.local');
  staffLhrId = await userId('staff.lhr@jobbank.local');
  employerId = await userId('employer@jobbank.local');
  const [member] = await db
    .select()
    .from(schema.companyMembers)
    .where(eq(schema.companyMembers.userId, employerId));
  companyId = member!.companyId;
  const [branch] = await db
    .select()
    .from(schema.branches)
    .where(eq(schema.branches.code, 'KHI-GULSHAN'));
  branchId = branch!.id;
});

beforeEach(() => resetMemoryRateLimits());

async function application(status: 'EMPLOYER_INTERVIEW_SCHEDULED' | 'FORWARDED' | 'SHORTLISTED') {
  const phone = randomPhone();
  await signInApplicant(phone);
  const [user] = await db.select().from(schema.users).where(eq(schema.users.phoneNumber, phone));
  const [applicant] = await db
    .insert(schema.applicants)
    .values({
      userId: user!.id,
      branchId,
      registrationSource: 'SELF_SERVICE',
      registrationReference: `SJB-TEST-${crypto.randomUUID()}`,
      fullName: 'Hidden Candidate',
      fatherName: 'Father',
      cnic: '5' + String(Math.floor(1e11 + Math.random() * 8.99e11)),
      dateOfBirth: '1995-05-05',
      gender: 'MALE',
      status: 'ACTIVE',
      profileCompleteness: 100,
    })
    .returning();
  const [job] = await db
    .insert(schema.jobs)
    .values({
      companyId,
      branchId,
      title: 'Act For Employer Job',
      categoryCode: 'CALL_CENTRE',
      description: 'Job used by the act-for-employer tests.',
      jobType: 'FULL_TIME',
      shift: 'ROTATING',
      shiftHours: 8,
      vacancies: 1,
      status: 'OPEN',
      createdBy: employerId,
    })
    .returning();
  const [row] = await db
    .insert(schema.applications)
    .values({ applicantId: applicant!.id, jobId: job!.id, branchId, createdBy: employerId, status })
    .returning();
  return row!;
}

const send = (id: string, jar: Jar, body: unknown, headers = ON_BEHALF(companyId)) =>
  call(decide, `/api/v1/applications/${id}/employer-decision`, {
    method: 'POST',
    jar,
    params: { id },
    body,
    headers,
  });

const newJob = {
  title: 'Warehouse Helper',
  categoryCode: 'CALL_CENTRE',
  description: 'Help in the warehouse, loading and unloading goods.',
  jobType: 'FULL_TIME',
  shift: 'ROTATING',
  shiftHours: 8,
  vacancies: 2,
};

describe('staff acting for an employer', () => {
  it('refuses a decision for the company — employer decisions were removed', async () => {
    const app = await application('EMPLOYER_INTERVIEW_SCHEDULED');
    const res = await send(app.id, staffKhi, { decision: 'HOLD' });
    expect(res.status, JSON.stringify(res.body)).toBe(403);
    expect(res.body.error.message).toBe(
      'Employers can no longer record decisions on referred candidates',
    );

    // Nothing is recorded: no decision row and no decision audit entry.
    const [record] = await db
      .select()
      .from(schema.employerDecisions)
      .where(eq(schema.employerDecisions.applicationId, app.id));
    expect(record).toBeUndefined();
    const [log] = await db
      .select()
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.entityId, app.id),
          eq(schema.auditLogs.action, 'application.employer_decision'),
        ),
      );
    expect(log).toBeUndefined();
  });

  it('refuses every decision — REJECTED, ACCEPTED and HOLD all 403', async () => {
    const app = await application('EMPLOYER_INTERVIEW_SCHEDULED');
    expect((await send(app.id, staffKhi, { decision: 'REJECTED' })).status).toBe(403);
    expect((await send(app.id, staffKhi, { decision: 'ACCEPTED' })).status).toBe(403);
    expect((await send(app.id, staffKhi, { decision: 'HOLD' })).status).toBe(403);
  });

  it('posts a job that belongs to the company', async () => {
    const res = await call(createJob, '/api/v1/jobs/me', {
      method: 'POST',
      jar: staffKhi,
      body: newJob,
      headers: ON_BEHALF(companyId),
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, res.body.data.id));
    expect(job!.companyId).toBe(companyId);
    expect(job!.createdBy).toBe(staffKhiId);
  });

  it('shows referred candidates in full to the employer view, and unreferred ones out of it', async () => {
    // Flipped from Najam: this repo's 2026-11-10 rule (hide-on-referral = No) shows
    // the referred candidate's full name, phone and details to the employer; only
    // the CNIC is never shown. Acting for the employer shows exactly what the
    // employer themself would see.
    const { actor } = await actingForEmployer(await loadActor(staffKhiId), companyId);
    const referred = await application('FORWARDED');
    const view = await getApplicationForEmployer(actor, referred.id);
    expect(view.applicant.fullName).toContain('Hidden Candidate');
    expect(view.applicant.phone).not.toBeNull();

    const unreferred = await application('SHORTLISTED');
    await expect(getApplicationForEmployer(actor, unreferred.id)).rejects.toMatchObject({
      status: 404,
    });
  });

  it('refuses staff from another city', async () => {
    const app = await application('EMPLOYER_INTERVIEW_SCHEDULED');
    expect((await send(app.id, staffLhr, { decision: 'HOLD' })).status).toBe(403);
    const [row] = await db
      .select()
      .from(schema.applications)
      .where(eq(schema.applications.id, app.id));
    expect(row!.status).toBe('EMPLOYER_INTERVIEW_SCHEDULED');
    const list = await listManagedEmployers(await loadActor(staffLhrId));
    expect(list.some((e) => e.id === companyId)).toBe(false);
  });

  it('refuses job seekers, verifiers and Super Admins', async () => {
    const app = await application('EMPLOYER_INTERVIEW_SCHEDULED');
    const seeker = await signInApplicant(randomPhone());
    expect((await send(app.id, seeker, { decision: 'HOLD' })).status).toBe(403);
    const verifier = await signIn('verifier.khi@jobbank.local');
    expect((await send(app.id, verifier, { decision: 'HOLD' })).status).toBe(403);
    const superAdmin = await loadActor(await userId('superadmin@jobbank.local'));
    await expect(actingForEmployer(superAdmin, companyId)).rejects.toMatchObject({ status: 403 });
  });

  it('does not let one employer act for another company', async () => {
    const [other] = await db
      .insert(schema.companies)
      .values({
        branchId,
        legalName: 'Another Verified Company',
        legalStructure: 'PRIVATE_LIMITED',
        ntn: String(Math.floor(1e6 + Math.random() * 9e6)),
        industryCode: 'RETAIL',
        sizeBand: '1_10',
        status: 'VERIFIED',
        verifiedAt: new Date(),
        createdBy: staffKhiId,
      })
      .returning();
    const res = await call(createJob, '/api/v1/jobs/me', {
      method: 'POST',
      jar: employer,
      body: newJob,
      headers: ON_BEHALF(other!.id),
    });
    expect(res.status).toBe(403);
  });

  it('refuses companies that are not verified, and unknown ones', async () => {
    const app = await application('EMPLOYER_INTERVIEW_SCHEDULED');
    await owner`UPDATE companies SET status = 'SUSPENDED' WHERE id = ${companyId}`;
    try {
      expect((await send(app.id, staffKhi, { decision: 'HOLD' })).status).toBe(403);
    } finally {
      await owner`UPDATE companies SET status = 'VERIFIED' WHERE id = ${companyId}`;
    }
    const missing = ON_BEHALF('00000000-0000-4000-8000-00000000dead');
    expect((await send(app.id, staffKhi, { decision: 'HOLD' }, missing)).status).toBe(404);
  });

  it('does not widen access on routes that do not allow it', async () => {
    const res = await call(listBranches, '/api/v1/branches', {
      jar: employer,
      headers: ON_BEHALF(companyId),
    });
    expect(res.status).toBe(403);
  });

  it('lets the employer keep working normally', async () => {
    const app = await application('EMPLOYER_INTERVIEW_SCHEDULED');
    // Decisions are refused, but the employer's read access still works.
    const res = await send(app.id, employer, { decision: 'HOLD' }, {});
    expect(res.status).toBe(403);
    const read = await call(messages, `/api/v1/applications/${app.id}/messages`, {
      jar: employer,
      params: { id: app.id },
    });
    expect(read.status).toBe(200);
  });
});
