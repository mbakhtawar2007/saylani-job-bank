import { permissionsFor } from '@jobbank/shared';
import { schema } from '@jobbank/db';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GET as listReferrals, POST as referJob } from '@/app/api/v1/jobs/[id]/referrals/route';
import {
  getEmployerJob,
  getEmployerReferralStats,
  hasVisibleEmployerJobs,
  listJobReferrals,
  listJobsForEmployer,
} from '@/domains/job';
import { getJobMatches } from '@/domains/matching';
import { NotFoundError } from '@/domains/shared/errors';
import type { Actor } from '@/domains/shared/scope';
import { resetMemoryRateLimits } from '@/domains/shared/rate-limit';
import { db } from '@/lib/db';
import { call, signIn, type Jar } from '@/test/api-client';

const us = schema.users;
const co = schema.companies;
const j = schema.jobs;

const tag = Date.now().toString(36);
/** Seeded verified company owned by employer@jobbank.local. */
const HAMZA_ID = '00000000-0000-4000-8000-00000000c001';

let KHI: string;
let staffJar: Jar;
let employerJar: Jar;
let employerUserId: string;
let jobId: string;
let otherJobId: string;
let draftCompanyId: string;

function actorFor(userId: string, roles: Actor['roles'], companyId: string | null): Actor {
  return {
    userId,
    roles,
    permissions: permissionsFor(roles),
    branchIds: [KHI],
    activeBranchId: null,
    companyId,
    applicantId: null,
    twoFactorPending: false,
  };
}

beforeAll(async () => {
  KHI = (
    await db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.code, 'KHI-GULSHAN'))
  )[0]!.id;

  employerUserId = (
    await db.select({ id: us.id }).from(us).where(eq(us.email, 'employer@jobbank.local'))
  )[0]!.id;
  const staffUserId = (
    await db.select({ id: us.id }).from(us).where(eq(us.email, 'staff.khi@jobbank.local'))
  )[0]!.id;

  // A second verified company that owns the job being referred.
  const [companyA] = await db
    .insert(co)
    .values({
      branchId: KHI,
      legalName: `Referral Source Traders ${tag}`,
      legalStructure: 'PRIVATE_LIMITED',
      ntn: String(Math.floor(1e6 + Math.random() * 9e6)),
      industryCode: 'RETAIL',
      sizeBand: '1_10',
      status: 'VERIFIED',
      verifiedAt: new Date(),
      createdBy: staffUserId,
    })
    .returning({ id: co.id });
  const companyAId = companyA!.id;

  const [draftCompany] = await db
    .insert(co)
    .values({
      branchId: KHI,
      legalName: `Referral Draft Traders ${tag}`,
      legalStructure: 'PRIVATE_LIMITED',
      ntn: String(Math.floor(1e6 + Math.random() * 9e6)),
      industryCode: 'RETAIL',
      sizeBand: '1_10',
      status: 'DRAFT',
      createdBy: staffUserId,
    })
    .returning({ id: co.id });
  draftCompanyId = draftCompany!.id;

  const [job] = await db
    .insert(j)
    .values({
      companyId: companyAId,
      branchId: KHI,
      title: `Referral Rider ${tag}`,
      categoryCode: 'DRIVING_DELIVERY',
      description: 'A job staff will refer to Hamza Traders.',
      jobType: 'FULL_TIME',
      shift: 'DAY',
      vacancies: 2,
      status: 'OPEN',
      createdBy: staffUserId,
    })
    .returning({ id: j.id });
  jobId = job!.id;

  const [otherJob] = await db
    .insert(j)
    .values({
      companyId: companyAId,
      branchId: KHI,
      title: `Unreferred Rider ${tag}`,
      categoryCode: 'DRIVING_DELIVERY',
      description: 'Never referred to anyone.',
      jobType: 'FULL_TIME',
      shift: 'DAY',
      vacancies: 1,
      status: 'OPEN',
      createdBy: staffUserId,
    })
    .returning({ id: j.id });
  otherJobId = otherJob!.id;

  staffJar = await signIn('staff.khi@jobbank.local');
  employerJar = await signIn('employer@jobbank.local');
});

describe('job referrals', () => {
  beforeEach(() => resetMemoryRateLimits());

  it('staff refers a job to an employer; re-referring is a no-op', async () => {
    const first = await call(referJob, `/api/v1/jobs/${jobId}/referrals`, {
      method: 'POST',
      body: { companyId: HAMZA_ID, note: 'Urgent — they asked for riders.' },
      jar: staffJar,
      params: { id: jobId },
    });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body.data.companyId).toBe(HAMZA_ID);
    expect(first.body.data.note).toBe('Urgent — they asked for riders.');

    const second = await call(referJob, `/api/v1/jobs/${jobId}/referrals`, {
      method: 'POST',
      body: { companyId: HAMZA_ID },
      jar: staffJar,
      params: { id: jobId },
    });
    expect(second.status, JSON.stringify(second.body)).toBe(201);
    expect(second.body.data.id).toBe(first.body.data.id);

    const listed = await call(listReferrals, `/api/v1/jobs/${jobId}/referrals`, {
      jar: staffJar,
      params: { id: jobId },
    });
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);
  });

  it('employer sees the referred job (marked REFERRED) but not unreferred jobs', async () => {
    const employer = actorFor(employerUserId, ['EMPLOYER'], HAMZA_ID);
    const jobs = await listJobsForEmployer(employer);
    const referred = jobs.find((row) => row.id === jobId);
    expect(referred?.source).toBe('REFERRED');
    expect(jobs.some((row) => row.id === otherJobId)).toBe(false);

    const detail = await getEmployerJob(employer, jobId);
    expect(detail.source).toBe('REFERRED');
    expect(detail.referralNote).toBe('Urgent — they asked for riders.');
    await expect(getEmployerJob(employer, otherJobId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('sidebar + dashboard see the referral', async () => {
    const employer = actorFor(employerUserId, ['EMPLOYER'], HAMZA_ID);
    await expect(hasVisibleEmployerJobs(employer)).resolves.toBe(true);
    const stats = await getEmployerReferralStats(employer);
    expect(stats.totalReferred).toBeGreaterThanOrEqual(1);
    expect(stats.openReferred).toBeGreaterThanOrEqual(1);
    expect(stats.referredLast30Days).toBeGreaterThanOrEqual(1);
    expect(stats.latestReferredAt).not.toBeNull();
  });

  it('cannot refer to an unverified company, and employers cannot refer', async () => {
    const draft = await call(referJob, `/api/v1/jobs/${jobId}/referrals`, {
      method: 'POST',
      body: { companyId: draftCompanyId },
      jar: staffJar,
      params: { id: jobId },
    });
    expect(draft.status, JSON.stringify(draft.body)).toBe(403);

    const byEmployer = await call(referJob, `/api/v1/jobs/${jobId}/referrals`, {
      method: 'POST',
      body: { companyId: HAMZA_ID },
      jar: employerJar,
      params: { id: jobId },
    });
    expect(byEmployer.status, JSON.stringify(byEmployer.body)).toBe(403);
  });

  it('a branch-assigned employer sees only their own company’s referrals for a job (H5)', async () => {
    const [otherCompany] = await db
      .insert(co)
      .values({
        branchId: KHI,
        legalName: `Other Referral Traders ${tag}`,
        legalStructure: 'PRIVATE_LIMITED',
        ntn: String(Math.floor(1e6 + Math.random() * 9e6)),
        industryCode: 'RETAIL',
        sizeBand: '1_10',
        status: 'VERIFIED',
        verifiedAt: new Date(),
        createdBy: employerUserId,
      })
      .returning({ id: co.id });
    for (const target of [HAMZA_ID, otherCompany!.id]) {
      const res = await call(referJob, `/api/v1/jobs/${jobId}/referrals`, {
        method: 'POST',
        body: { companyId: target },
        jar: staffJar,
        params: { id: jobId },
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
    }

    // Staff see both referrals …
    const staffListed = await call(listReferrals, `/api/v1/jobs/${jobId}/referrals`, {
      jar: staffJar,
      params: { id: jobId },
    });
    expect(staffListed.status).toBe(200);
    expect(staffListed.body.data).toHaveLength(2);

    // … but the branch-assigned employer sees only their own company’s row.
    const employer = actorFor(employerUserId, ['EMPLOYER'], HAMZA_ID);
    const rows = await listJobReferrals(employer, jobId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.companyId).toBe(HAMZA_ID);
  });

  it('cannot refer a DRAFT job; a referred employer can open its matches (M28)', async () => {
    const [draftJob] = await db
      .insert(j)
      .values({
        companyId: HAMZA_ID,
        branchId: KHI,
        title: `Draft Rider ${tag}`,
        categoryCode: 'DRIVING_DELIVERY',
        description: 'Never published.',
        jobType: 'FULL_TIME',
        shift: 'DAY',
        vacancies: 1,
        status: 'DRAFT',
        createdBy: employerUserId,
      })
      .returning({ id: j.id });
    const draft = await call(referJob, `/api/v1/jobs/${draftJob!.id}/referrals`, {
      method: 'POST',
      body: { companyId: HAMZA_ID },
      jar: staffJar,
      params: { id: draftJob!.id },
    });
    expect(draft.status, JSON.stringify(draft.body)).toBe(403);

    // The fixture job is referred to Hamza Traders (idempotent re-refer).
    const referred = await call(referJob, `/api/v1/jobs/${jobId}/referrals`, {
      method: 'POST',
      body: { companyId: HAMZA_ID },
      jar: staffJar,
      params: { id: jobId },
    });
    expect(referred.status, JSON.stringify(referred.body)).toBe(201);

    const employer = actorFor(employerUserId, ['EMPLOYER'], HAMZA_ID);
    await expect(getJobMatches(employer, jobId, { page: 1, pageSize: 20 })).resolves.toEqual({
      run: null,
      matches: [],
      total: 0,
    });
    await expect(
      getJobMatches(employer, otherJobId, { page: 1, pageSize: 20 }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
