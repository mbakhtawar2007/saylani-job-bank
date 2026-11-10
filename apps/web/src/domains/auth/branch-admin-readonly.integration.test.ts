import { schema } from '@jobbank/db';
import { and, eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { GET as listApplicants } from '@/app/api/v1/applicants/route';
import { GET as getApplicant, PATCH as editApplicant } from '@/app/api/v1/applicants/[id]/route';
import { POST as registerApplicant } from '@/app/api/v1/applicants/staff-register/route';
import { PATCH as editProfile } from '@/app/api/v1/applicants/[id]/profile/route';
import { PUT as changePhone } from '@/app/api/v1/applicants/[id]/phone/route';
import { PATCH as changeApplicantStatus } from '@/app/api/v1/applicants/[id]/status/route';
import { POST as transferApplicant } from '@/app/api/v1/applicants/[id]/transfer/route';
import { POST as verifyIdentity } from '@/app/api/v1/applicants/[id]/identity-verification/route';
import { POST as printRegistration } from '@/app/api/v1/applicants/[id]/registration-form/route';
import { POST as rotateToken } from '@/app/api/v1/applicants/[id]/verification-token/regenerate/route';
import { GET as listCompanies, POST as registerCompany } from '@/app/api/v1/companies/route';
import { GET as getCompany, PATCH as editCompany } from '@/app/api/v1/companies/[id]/route';
import { PATCH as changeCompanyStatus } from '@/app/api/v1/companies/[id]/status/route';
import { POST as transferCompany } from '@/app/api/v1/companies/[id]/transfer/route';
import { POST as assignVerifier } from '@/app/api/v1/companies/[id]/assign-verifier/route';
import { POST as verifyCompany } from '@/app/api/v1/companies/[id]/verify/route';
import { POST as rejectCompany } from '@/app/api/v1/companies/[id]/reject/route';
import { POST as requestCompanyInfo } from '@/app/api/v1/companies/[id]/request-info/route';
import { POST as claimCompany } from '@/app/api/v1/companies/[id]/claim/route';
import { POST as releaseCompany } from '@/app/api/v1/companies/[id]/release/route';
import { PATCH as reviewCompanyDocument } from '@/app/api/v1/companies/[id]/documents/[docId]/review/route';
import { GET as listJobs, POST as createJob } from '@/app/api/v1/jobs/route';
import { GET as getJob, PATCH as editJob } from '@/app/api/v1/jobs/[id]/route';
import { PATCH as changeJobStatus } from '@/app/api/v1/jobs/[id]/status/route';
import { POST as createCompanyJob } from '@/app/api/v1/companies/[id]/jobs/route';
import { PATCH as editCompanyJob } from '@/app/api/v1/companies/[id]/jobs/[jobId]/route';
import { PATCH as changeCompanyJobStatus } from '@/app/api/v1/companies/[id]/jobs/[jobId]/status/route';
import { loadActor } from '@/domains/auth';
import { listCompanies as listCompaniesForActor } from '@/domains/company';
import { getCompanyJobDetail, listJobs as listJobsForActor } from '@/domains/job';
import {
  listApplicants as listApplicantsForActor,
  transferApplicant as transferApplicantForActor,
} from '@/domains/applicant';
import { systemContext } from '@/domains/shared/audit';
import { db } from '@/lib/db';
import { call, randomPhone, signInAdmin, type Jar } from '@/test/api-client';

const marker = `Scope${crypto
  .randomUUID()
  .replaceAll('-', '')
  .slice(0, 12)
  .replace(/[0-9]/g, (digit) => String.fromCharCode(107 + Number(digit)))}`;
let admin: Jar;
let branchAdmin: Jar;
let khi: string;
let lhr: string;
let own: { applicant: string; company: string; job: string };
let other: typeof own;

async function createFixtures(branchId: string, suffix: string) {
  const key = () => `readonly-${crypto.randomUUID()}`;
  const applicant = await call(registerApplicant, '/api/v1/applicants/staff-register', {
    method: 'POST',
    jar: admin,
    headers: { 'idempotency-key': key() },
    body: {
      branchId,
      fullName: `${marker} ${suffix}`,
      fatherName: 'Test Parent',
      cnic: `42${String(Math.floor(Math.random() * 1e11)).padStart(11, '0')}`,
      dateOfBirth: '1998-04-12',
      gender: 'FEMALE',
      phone: randomPhone(),
      email: '',
      address: {
        addressLine: 'House 12, Test Street',
        cityCode: 'KARACHI',
        areaCode: 'KARACHI_GULSHAN_E_IQBAL',
        branchId,
        location: { lat: 24.9256, lng: 67.0899 },
      },
    },
  });
  expect(applicant.status, JSON.stringify(applicant.body)).toBe(201);
  const company = await call(registerCompany, '/api/v1/companies', {
    method: 'POST',
    jar: admin,
    headers: { 'idempotency-key': key() },
    body: {
      branchId,
      legalName: `${marker} ${suffix}`,
      legalStructure: 'PRIVATE_LIMITED',
      ntn: `${Math.floor(1_000_000 + Math.random() * 9_000_000)}`,
      industryCode: 'RETAIL',
      sizeBand: '1_10',
      contacts: { items: [{ name: 'Test Contact', phone: '03001234567', isPrimary: true }] },
    },
  });
  expect(company.status, JSON.stringify(company.body)).toBe(201);
  const job = await call(createJob, '/api/v1/jobs', {
    method: 'POST',
    jar: admin,
    headers: { 'idempotency-key': key() },
    body: {
      companyId: company.body.data.id,
      title: `${marker} ${suffix}`,
      categoryCode: 'RETAIL_SALES',
      description: 'A test vacancy for branch isolation.',
      jobType: 'FULL_TIME',
      shift: 'DAY',
      genderPreference: 'ANY',
      vacancies: 1,
    },
  });
  expect(job.status, JSON.stringify(job.body)).toBe(201);
  return {
    applicant: applicant.body.data.id,
    company: company.body.data.id,
    job: job.body.data.id,
  };
}

beforeAll(async () => {
  const branches = await db
    .select({ id: schema.branches.id, code: schema.branches.code })
    .from(schema.branches);
  khi = branches.find((branch) => branch.code === 'KHI-GULSHAN')!.id;
  lhr = branches.find((branch) => branch.code === 'LHR-JOHAR')!.id;
  admin = await signInAdmin('superadmin@jobbank.local');
  branchAdmin = await signInAdmin('branchadmin.khi@jobbank.local');
  own = await createFixtures(khi, 'Own');
  other = await createFixtures(lhr, 'Other');
}, 120_000);

describe('Branch Admin read-only authorization', () => {
  it('scopes searched and paginated lists and counts to assigned branches', async () => {
    for (const [route, path, key] of [
      [listApplicants, '/api/v1/applicants', 'applicant'],
      [listCompanies, '/api/v1/companies', 'company'],
      [listJobs, '/api/v1/jobs', 'job'],
    ] as const) {
      const response = await call(route, `${path}?q=${marker}&page=1&pageSize=1`, {
        jar: branchAdmin,
      });
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      const items = Array.isArray(response.body.data)
        ? response.body.data
        : response.body.data.items;
      const meta = response.body.meta ?? response.body.data.pagination;
      expect(meta.total).toBe(1);
      expect(items.map((item: { id: string }) => item.id)).toEqual([own[key]]);
      const otherSearch = await call(route, `${path}?q=${marker}%20Other`, { jar: branchAdmin });
      const otherMeta = otherSearch.body.meta ?? otherSearch.body.data.pagination;
      expect(otherSearch.status).toBe(200);
      expect(otherMeta.total).toBe(0);
    }
  });

  it('allows own details and rejects direct cross-branch IDs', async () => {
    for (const [route, path, key] of [
      [getApplicant, '/api/v1/applicants', 'applicant'],
      [getCompany, '/api/v1/companies', 'company'],
      [getJob, '/api/v1/jobs', 'job'],
    ] as const) {
      expect(
        (await call(route, `${path}/${own[key]}`, { jar: branchAdmin, params: { id: own[key] } }))
          .status,
      ).toBe(200);
      expect(
        (
          await call(route, `${path}/${other[key]}`, {
            jar: branchAdmin,
            params: { id: other[key] },
          })
        ).status,
      ).toBe(403);
    }
  });

  it('does not expose cross-branch records through filters', async () => {
    for (const [route, path] of [
      [listApplicants, '/api/v1/applicants'],
      [listCompanies, '/api/v1/companies'],
      [listJobs, '/api/v1/jobs'],
    ] as const) {
      const response = await call(route, `${path}?branchId=${lhr}`, { jar: branchAdmin });
      if (response.status === 200) {
        const meta = response.body.meta ?? response.body.data.pagination;
        expect(meta.total).toBe(0);
      } else {
        expect(response.status).toBe(403);
      }
    }
  });

  it('preserves assigned multi-branch scope and denies actors without branches', async () => {
    const [user] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, 'branchadmin.khi@jobbank.local'));
    const actor = await loadActor(user!.id);
    for (const [branchIds, expected] of [
      [[khi, lhr], 2],
      [[], 0],
    ] as const) {
      const scoped = { ...actor, branchIds };
      const query = {
        page: 1,
        pageSize: 20,
        limit: 20,
        offset: 0,
        sort: { field: 'createdAt' as const, direction: 'desc' as const },
        q: marker,
        filters: {},
      };
      expect((await listApplicantsForActor(scoped, query)).meta.total).toBe(expected);
      expect((await listCompaniesForActor(scoped, query)).pagination.total).toBe(expected);
      expect((await listJobsForActor(scoped, query)).pagination.total).toBe(expected);
    }
  });

  it('retains visibility of non-public company statuses within the assigned branch', async () => {
    await db
      .update(schema.companies)
      .set({ status: 'DRAFT' })
      .where(eq(schema.companies.id, own.company));
    const list = await call(listCompanies, `/api/v1/companies?q=${marker}&status=DRAFT`, {
      jar: branchAdmin,
    });
    expect(list.status).toBe(200);
    expect(list.body.data.items).toEqual([
      expect.objectContaining({ id: own.company, status: 'DRAFT' }),
    ]);
    const detail = await call(getCompany, `/api/v1/companies/${own.company}`, {
      jar: branchAdmin,
      params: { id: own.company },
    });
    expect(detail.status).toBe(200);
  });

  it('filters Info needed companies within the assigned branch', async () => {
    const company = (await createFixtures(khi, 'InfoNeeded')).company;
    await db
      .update(schema.companies)
      .set({ status: 'INFO_REQUESTED' })
      .where(eq(schema.companies.id, company));
    const list = await call(
      listCompanies,
      `/api/v1/companies?q=${marker}%20InfoNeeded&status=INFO_REQUESTED`,
      { jar: branchAdmin },
    );
    expect(list.status).toBe(200);
    expect(list.body.data.items).toEqual([
      expect.objectContaining({ id: company, status: 'INFO_REQUESTED' }),
    ]);
  });

  it('rejects applicant mutations other than transfer and all company and job mutations', async () => {
    const mutations = [
      [registerApplicant, 'POST', '/api/v1/applicants/staff-register', {}],
      [editApplicant, 'PATCH', `/api/v1/applicants/${own.applicant}`, { id: own.applicant }],
      [editProfile, 'PATCH', `/api/v1/applicants/${own.applicant}/profile`, { id: own.applicant }],
      [changePhone, 'PUT', `/api/v1/applicants/${own.applicant}/phone`, { id: own.applicant }],
      [
        changeApplicantStatus,
        'PATCH',
        `/api/v1/applicants/${own.applicant}/status`,
        { id: own.applicant },
      ],
      [
        verifyIdentity,
        'POST',
        `/api/v1/applicants/${own.applicant}/identity-verification`,
        { id: own.applicant },
      ],
      [
        printRegistration,
        'POST',
        `/api/v1/applicants/${own.applicant}/registration-form`,
        { id: own.applicant },
      ],
      [
        rotateToken,
        'POST',
        `/api/v1/applicants/${own.applicant}/verification-token/regenerate`,
        { id: own.applicant },
      ],
      [registerCompany, 'POST', '/api/v1/companies', {}],
      [editCompany, 'PATCH', `/api/v1/companies/${own.company}`, { id: own.company }],
      [
        changeCompanyStatus,
        'PATCH',
        `/api/v1/companies/${own.company}/status`,
        { id: own.company },
      ],
      [transferCompany, 'POST', `/api/v1/companies/${own.company}/transfer`, { id: own.company }],
      [
        assignVerifier,
        'POST',
        `/api/v1/companies/${own.company}/assign-verifier`,
        { id: own.company },
      ],
      [verifyCompany, 'POST', `/api/v1/companies/${own.company}/verify`, { id: own.company }],
      [rejectCompany, 'POST', `/api/v1/companies/${own.company}/reject`, { id: own.company }],
      [
        requestCompanyInfo,
        'POST',
        `/api/v1/companies/${own.company}/request-info`,
        { id: own.company },
      ],
      [claimCompany, 'POST', `/api/v1/companies/${own.company}/claim`, { id: own.company }],
      [releaseCompany, 'POST', `/api/v1/companies/${own.company}/release`, { id: own.company }],
      [
        reviewCompanyDocument,
        'PATCH',
        `/api/v1/companies/${own.company}/documents/${own.job}/review`,
        { id: own.company, docId: own.job },
      ],
      [createJob, 'POST', '/api/v1/jobs', {}],
      [editJob, 'PATCH', `/api/v1/jobs/${own.job}`, { id: own.job }],
      [changeJobStatus, 'PATCH', `/api/v1/jobs/${own.job}/status`, { id: own.job }],
      [createCompanyJob, 'POST', `/api/v1/companies/${own.company}/jobs`, { id: own.company }],
      [
        editCompanyJob,
        'PATCH',
        `/api/v1/companies/${own.company}/jobs/${own.job}`,
        { id: own.company, jobId: own.job },
      ],
      [
        changeCompanyJobStatus,
        'PATCH',
        `/api/v1/companies/${own.company}/jobs/${own.job}/status`,
        { id: own.company, jobId: own.job },
      ],
    ] as const;
    for (const [route, method, path, params] of mutations) {
      const result = await call(route, path, { method, jar: branchAdmin, params, body: {} });
      expect(result.status, `${method} ${path}: ${JSON.stringify(result.body)}`).toBe(403);
    }
  });

  it('authorizes company-scoped job details and rejects mismatched or cross-branch IDs', async () => {
    const [user] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, 'branchadmin.khi@jobbank.local'));
    const actor = await loadActor(user!.id);
    const another = await createFixtures(khi, 'Another');
    expect((await getCompanyJobDetail(actor, own.company, own.job)).job.id).toBe(own.job);
    await expect(getCompanyJobDetail(actor, own.company, another.job)).rejects.toMatchObject({
      status: 404,
    });
    await expect(getCompanyJobDetail(actor, own.company, other.job)).rejects.toMatchObject({
      status: 403,
    });
    await expect(getCompanyJobDetail(actor, other.company, other.job)).rejects.toMatchObject({
      status: 403,
    });
    await expect(getCompanyJobDetail(actor, crypto.randomUUID(), own.job)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      getCompanyJobDetail(actor, own.company, crypto.randomUUID()),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('allows only authorized, current-source transfers and records the result', async () => {
    const applicant = (await createFixtures(khi, 'Transfer')).applicant;
    const path = `/api/v1/applicants/${applicant}/transfer`;
    const params = { id: applicant };
    const send = (body: object) =>
      call(transferApplicant, path, {
        method: 'POST',
        jar: branchAdmin,
        params,
        body,
      });
    const [inactive] = await db
      .insert(schema.branches)
      .values({
        code: `TEST${crypto.randomUUID().replaceAll('-', '').toUpperCase()}`,
        name: 'Inactive test branch',
        city: 'Test',
        isActive: false,
      })
      .returning({ id: schema.branches.id });
    expect(
      (await send({ branchId: inactive!.id, expectedBranchId: khi, reason: 'Moving branch' }))
        .status,
    ).toBe(422);
    expect(
      (
        await send({
          branchId: crypto.randomUUID(),
          expectedBranchId: khi,
          reason: 'Moving branch',
        })
      ).status,
    ).toBe(422);
    expect(
      (await send({ branchId: 'invalid', expectedBranchId: khi, reason: 'Moving branch' })).status,
    ).toBe(422);
    expect((await send({ branchId: lhr, expectedBranchId: khi })).status).toBe(422);
    expect((await send({ branchId: lhr, reason: 'Moving branch' })).status).toBe(422);
    expect(
      (await send({ branchId: khi, expectedBranchId: khi, reason: 'Moving branch' })).status,
    ).toBe(409);
    const crossBranch = await call(
      transferApplicant,
      `/api/v1/applicants/${other.applicant}/transfer`,
      {
        method: 'POST',
        jar: branchAdmin,
        params: { id: other.applicant },
        body: { branchId: khi, expectedBranchId: lhr, reason: 'Moving branch' },
      },
    );
    expect(crossBranch.status).toBe(403);
    const results = await Promise.all([
      send({ branchId: lhr, expectedBranchId: khi, reason: 'Moving branch' }),
      send({ branchId: lhr, expectedBranchId: khi, reason: 'Moving branch' }),
    ]);
    expect(results.filter((result) => result.status === 200)).toHaveLength(1);
    expect([403, 409]).toContain(results.find((result) => result.status !== 200)?.status);
    const [row] = await db
      .select({ branchId: schema.applicants.branchId })
      .from(schema.applicants)
      .where(eq(schema.applicants.id, applicant));
    expect(row?.branchId).toBe(lhr);
    const audits = await db
      .select()
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.action, 'applicant.transfer'),
          eq(schema.auditLogs.entityId, applicant),
        ),
      );
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      before: { branchId: khi },
      after: { branchId: lhr },
      reason: 'Moving branch',
    });
    expect(
      (await call(getApplicant, `/api/v1/applicants/${applicant}`, { jar: branchAdmin, params }))
        .status,
    ).toBe(403);
  });

  it('rejects competing transfers even when an admin can access every branch involved', async () => {
    const applicant = (await createFixtures(khi, 'Concurrent')).applicant;
    const [branch] = await db
      .insert(schema.branches)
      .values({
        code: `TEST${crypto.randomUUID().replaceAll('-', '').toUpperCase()}`,
        name: 'Concurrent transfer branch',
        city: 'Test',
      })
      .returning({ id: schema.branches.id });
    const [user] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, 'branchadmin.khi@jobbank.local'));
    const actor = { ...(await loadActor(user!.id)), branchIds: [khi, lhr, branch!.id] };
    const ctx = { ...systemContext('transfer-test'), actor, system: false };
    const results = await Promise.allSettled([
      transferApplicantForActor(ctx, applicant, {
        branchId: lhr,
        expectedBranchId: khi,
        reason: 'Moving branch',
      }),
      transferApplicantForActor(ctx, applicant, {
        branchId: branch!.id,
        expectedBranchId: khi,
        reason: 'Moving branch',
      }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({ status: 'rejected', reason: { status: 409 } });
    const audits = await db
      .select()
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.action, 'applicant.transfer'),
          eq(schema.auditLogs.entityId, applicant),
        ),
      );
    expect(audits).toHaveLength(1);
  });
});
