import { schema } from '@jobbank/db';
import { and, eq, inArray, ne } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  GET as listCompaniesRoute,
  POST as registerCompanyRoute,
} from '@/app/api/v1/companies/route';
import { PATCH as changeJobStatusRoute } from '@/app/api/v1/jobs/[id]/status/route';
import { PATCH as updateJobRoute } from '@/app/api/v1/jobs/[id]/route';
import { GET as listJobsRoute, POST as createJobRoute } from '@/app/api/v1/jobs/route';
import { PATCH as updateCompanyJobRoute } from '@/app/api/v1/companies/[id]/jobs/[jobId]/route';
import { PATCH as changeCompanyJobStatusRoute } from '@/app/api/v1/companies/[id]/jobs/[jobId]/status/route';
import { POST as createCompanyJobRoute } from '@/app/api/v1/companies/[id]/jobs/route';
import { loadActor } from '@/domains/auth';
import { listCompanyJobs } from '@/domains/job';
import { db } from '@/lib/db';
import { call, signIn, signInAdmin } from '@/test/api-client';

let khiBranchId: string;
let lhrBranchId: string;
let sequence = 0;

const randomNtn = () => `${Math.floor(1_000_000 + Math.random() * 9_000_000)}`;
const idempotencyKey = () => `staff-company-${Date.now()}-${sequence++}`;

function registration(branchId: string, ntn: string) {
  return {
    branchId,
    legalName: 'Staff Registered Company',
    tradeName: null,
    legalStructure: 'PRIVATE_LIMITED',
    ntn,
    registrationNo: null,
    industryCode: 'RETAIL',
    sizeBand: '1_10',
    website: null,
    description: null,
    status: 'DRAFT',
    registrationSource: 'SELF_SERVICE',
    contacts: {
      items: [
        {
          name: 'Aisha Khan',
          designation: null,
          phone: '03001234567',
          email: null,
          isPrimary: true,
        },
      ],
    },
  };
}

beforeAll(async () => {
  const [khi, lhr] = await Promise.all([
    db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.code, 'KHI-GULSHAN')),
    db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.code, 'LHR-JOHAR')),
  ]);
  khiBranchId = khi[0]!.id;
  lhrBranchId = lhr[0]!.id;
});

describe('staff-assisted company registration', () => {
  it('creates a verified company with canonical contact data and a traceable audit event', async () => {
    const admin = await signInAdmin('superadmin@jobbank.local');
    const input = registration(khiBranchId, randomNtn());
    const key = idempotencyKey();
    const first = await call(registerCompanyRoute, '/api/v1/companies', {
      method: 'POST',
      body: input,
      jar: admin,
      headers: { 'idempotency-key': key },
    });

    expect(first.status, JSON.stringify(first.body)).toBe(201);
    const companyId = first.body.data.id as string;
    expect(first.body.data.status).toBe('VERIFIED');

    const [company] = await db
      .select({
        status: schema.companies.status,
        createdBy: schema.companies.createdBy,
        branchId: schema.companies.branchId,
        verifiedAt: schema.companies.verifiedAt,
      })
      .from(schema.companies)
      .where(eq(schema.companies.id, companyId));
    const [contact] = await db
      .select({ phone: schema.companyContacts.phone })
      .from(schema.companyContacts)
      .where(eq(schema.companyContacts.companyId, companyId));
    const [audit] = await db
      .select({
        action: schema.auditLogs.action,
        actorUserId: schema.auditLogs.actorUserId,
        after: schema.auditLogs.after,
      })
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.entityId, companyId),
          eq(schema.auditLogs.action, 'company.register_staff_assisted'),
        ),
      );

    expect(company).toMatchObject({
      status: 'VERIFIED',
      branchId: khiBranchId,
      createdBy: expect.any(String),
      verifiedAt: expect.any(Date),
    });
    expect(contact?.phone).toBe('+923001234567');
    expect(audit?.actorUserId).toBe(company?.createdBy);
    expect(audit?.after).toMatchObject({
      registrationSource: 'STAFF_ASSISTED',
      status: 'VERIFIED',
      createdBy: company?.createdBy,
      verifiedBy: company?.createdBy,
    });

    const listed = await call(
      listCompaniesRoute,
      `/api/v1/companies?q=${encodeURIComponent(input.ntn)}`,
      { jar: admin },
    );
    expect(listed.status).toBe(200);
    expect(listed.body.data.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: companyId, status: 'VERIFIED' })]),
    );

    const superAdminJob = await call(createJobRoute, '/api/v1/jobs', {
      method: 'POST',
      jar: admin,
      headers: { 'idempotency-key': `super-job-${Date.now()}-${sequence++}` },
      body: {
        companyId,
        title: `Staff company job ${Date.now()}`,
        categoryCode: 'RETAIL_SALES',
        description: 'A role created for a verified company.',
        jobType: 'FULL_TIME',
        shift: 'DAY',
        genderPreference: 'ANY',
        vacancies: 1,
      },
    });
    expect(superAdminJob.status, JSON.stringify(superAdminJob.body)).toBe(201);
    expect(superAdminJob.body.data).toMatchObject({
      companyId,
      branchId: khiBranchId,
      status: 'DRAFT',
    });
    const superJobId = superAdminJob.body.data.id as string;
    const superAdminEdit = await call(updateJobRoute, `/api/v1/jobs/${superJobId}`, {
      method: 'PATCH',
      jar: admin,
      params: { id: superJobId },
      body: { title: 'Updated by super admin', companyId: lhrBranchId },
    });
    expect(superAdminEdit.status).toBe(200);
    expect(superAdminEdit.body.data).toMatchObject({
      id: superJobId,
      companyId,
      branchId: khiBranchId,
      title: 'Updated by super admin',
      status: 'DRAFT',
    });
    const superAdminPublish = await call(
      changeJobStatusRoute,
      `/api/v1/jobs/${superJobId}/status`,
      {
        method: 'PATCH',
        jar: admin,
        params: { id: superJobId },
        body: { status: 'OPEN' },
      },
    );
    expect(superAdminPublish.status).toBe(403);
    const superAdminArchive = await call(
      changeJobStatusRoute,
      `/api/v1/jobs/${superJobId}/status`,
      {
        method: 'PATCH',
        jar: admin,
        params: { id: superJobId },
        body: { status: 'CLOSED' },
      },
    );
    expect(superAdminArchive.status).toBe(200);
    expect(superAdminArchive.body.data).toMatchObject({
      id: superJobId,
      companyId,
      status: 'CLOSED',
    });
    const superAdminList = await call(listJobsRoute, '/api/v1/jobs', { jar: admin });
    expect(superAdminList.status).toBe(200);

    const branchAdmin = await signInAdmin('branchadmin.khi@jobbank.local');
    const jobKey = `staff-job-${Date.now()}-${sequence++}`;
    const jobInput = {
      companyId,
      title: `Staff company job ${Date.now()}`,
      categoryCode: 'RETAIL_SALES',
      description: 'A role created for a verified company.',
      jobType: 'FULL_TIME',
      shift: 'DAY',
      genderPreference: 'ANY',
      vacancies: 1,
    };
    const job = await call(createJobRoute, '/api/v1/jobs', {
      method: 'POST',
      jar: admin,
      body: jobInput,
      headers: { 'idempotency-key': jobKey },
    });
    expect(job.status, JSON.stringify(job.body)).toBe(201);
    const deniedBranchJob = await call(createJobRoute, '/api/v1/jobs', {
      method: 'POST',
      jar: branchAdmin,
      body: jobInput,
      headers: { 'idempotency-key': `denied-job-${Date.now()}-${sequence++}` },
    });
    expect(deniedBranchJob.status).toBe(403);
    const [lhrCompany] = await db
      .select({ id: schema.companies.id })
      .from(schema.companies)
      .where(
        and(eq(schema.companies.branchId, lhrBranchId), eq(schema.companies.status, 'VERIFIED')),
      )
      .limit(1);
    expect(lhrCompany?.id).toBeTruthy();
    const superScopedJob = await call(
      createCompanyJobRoute,
      `/api/v1/companies/${lhrCompany!.id}/jobs`,
      {
        method: 'POST',
        jar: admin,
        params: { id: lhrCompany!.id },
        body: {
          title: `Super admin company job ${Date.now()}`,
          categoryCode: 'RETAIL_SALES',
          description: 'A draft job for a company in another branch.',
          jobType: 'FULL_TIME',
          shift: 'DAY',
          genderPreference: 'ANY',
          vacancies: 1,
        },
        headers: { 'idempotency-key': `super-company-job-${Date.now()}-${sequence++}` },
      },
    );
    expect(superScopedJob.status, JSON.stringify(superScopedJob.body)).toBe(201);
    expect(superScopedJob.body.data).toMatchObject({
      companyId: lhrCompany!.id,
      branchId: lhrBranchId,
      status: 'DRAFT',
    });
    const superScopedJobId = superScopedJob.body.data.id as string;
    const superWrongCompanyEdit = await call(
      updateCompanyJobRoute,
      `/api/v1/companies/${companyId}/jobs/${superScopedJobId}`,
      {
        method: 'PATCH',
        jar: admin,
        params: { id: companyId, jobId: superScopedJobId },
        body: { title: 'Wrong company' },
      },
    );
    expect(superWrongCompanyEdit.status).toBe(404);
    const superScopedEdit = await call(
      updateCompanyJobRoute,
      `/api/v1/companies/${lhrCompany!.id}/jobs/${superScopedJobId}`,
      {
        method: 'PATCH',
        jar: admin,
        params: { id: lhrCompany!.id, jobId: superScopedJobId },
        body: { title: 'Updated company job' },
      },
    );
    expect(superScopedEdit.status).toBe(200);
    expect(superScopedEdit.body.data).toMatchObject({
      companyId: lhrCompany!.id,
      title: 'Updated company job',
    });
    const superScopedArchive = await call(
      changeCompanyJobStatusRoute,
      `/api/v1/companies/${lhrCompany!.id}/jobs/${superScopedJobId}/status`,
      {
        method: 'PATCH',
        jar: admin,
        params: { id: lhrCompany!.id, jobId: superScopedJobId },
        body: { status: 'CLOSED' },
      },
    );
    expect(superScopedArchive.status).toBe(200);
    expect(superScopedArchive.body.data).toMatchObject({
      id: superScopedJobId,
      companyId: lhrCompany!.id,
      status: 'CLOSED',
    });
    const crossBranchJob = await call(createJobRoute, '/api/v1/jobs', {
      method: 'POST',
      jar: branchAdmin,
      body: { ...jobInput, companyId: lhrCompany!.id },
      headers: {
        'idempotency-key': `cross-branch-job-${Date.now()}-${sequence++}`,
      },
    });
    expect(crossBranchJob.status).toBe(403);

    const replayedJob = await call(createJobRoute, '/api/v1/jobs', {
      method: 'POST',
      jar: admin,
      body: jobInput,
      headers: { 'idempotency-key': jobKey },
    });
    expect(replayedJob.status).toBe(201);
    expect(replayedJob.body.data.id).toBe(job.body.data.id);
    expect(
      await db
        .select({ id: schema.jobs.id })
        .from(schema.jobs)
        .where(and(eq(schema.jobs.companyId, companyId), eq(schema.jobs.title, jobInput.title))),
    ).toHaveLength(1);

    const employer = await signIn('employer@jobbank.local');
    const employerJob = await call(createJobRoute, '/api/v1/jobs', {
      method: 'POST',
      jar: employer,
      body: jobInput,
      headers: {
        'idempotency-key': `employer-job-${Date.now()}-${sequence++}`,
      },
    });
    expect(employerJob.status).toBe(403);

    const [otherCompany] = await db
      .select({ id: schema.companies.id })
      .from(schema.companies)
      .where(
        and(
          eq(schema.companies.branchId, khiBranchId),
          eq(schema.companies.status, 'VERIFIED'),
          ne(schema.companies.id, companyId),
        ),
      )
      .limit(1);
    expect(otherCompany?.id).toBeTruthy();

    const [savedJob] = await db
      .select({
        companyId: schema.jobs.companyId,
        branchId: schema.jobs.branchId,
        status: schema.jobs.status,
      })
      .from(schema.jobs)
      .where(eq(schema.jobs.id, job.body.data.id));
    expect(savedJob).toEqual({
      companyId,
      branchId: khiBranchId,
      status: 'DRAFT',
    });
    const jobId = job.body.data.id as string;

    const crossCompanyEdit = await call(
      updateCompanyJobRoute,
      `/api/v1/companies/${otherCompany!.id}/jobs/${jobId}`,
      {
        method: 'PATCH',
        jar: admin,
        params: { id: otherCompany!.id, jobId },
        body: { title: 'Should not be editable from another company' },
      },
    );
    expect(crossCompanyEdit.status).toBe(404);

    const editedJob = await call(updateJobRoute, `/api/v1/jobs/${jobId}`, {
      method: 'PATCH',
      jar: admin,
      params: { id: jobId },
      body: { title: 'Updated staff-created job', companyId: lhrBranchId },
    });
    expect(editedJob.status).toBe(200);
    expect(editedJob.body.data).toMatchObject({
      id: jobId,
      companyId,
      branchId: khiBranchId,
      status: 'DRAFT',
    });

    const crossCompanyArchive = await call(
      changeCompanyJobStatusRoute,
      `/api/v1/companies/${otherCompany!.id}/jobs/${jobId}/status`,
      {
        method: 'PATCH',
        jar: admin,
        params: { id: otherCompany!.id, jobId },
        body: { status: 'CLOSED' },
      },
    );
    expect(crossCompanyArchive.status).toBe(404);

    const unauthorizedPublish = await call(changeJobStatusRoute, `/api/v1/jobs/${jobId}/status`, {
      method: 'PATCH',
      jar: admin,
      params: { id: jobId },
      body: { status: 'OPEN' },
    });
    expect(unauthorizedPublish.status).toBe(403);

    const archivedJob = await call(
      changeCompanyJobStatusRoute,
      `/api/v1/companies/${companyId}/jobs/${jobId}/status`,
      {
        method: 'PATCH',
        jar: admin,
        params: { id: companyId, jobId },
        body: { status: 'CLOSED', note: 'Archive historical job' },
      },
    );
    expect(archivedJob.status).toBe(200);
    expect(archivedJob.body.data.status).toBe('CLOSED');

    const companyScopedJob = await call(
      createCompanyJobRoute,
      `/api/v1/companies/${companyId}/jobs`,
      {
        method: 'POST',
        jar: admin,
        params: { id: companyId },
        body: {
          title: `Company tab job ${Date.now()}`,
          categoryCode: 'RETAIL_SALES',
          description: 'Created from the selected company profile.',
          jobType: 'FULL_TIME',
          shift: 'DAY',
          genderPreference: 'ANY',
          vacancies: 1,
        },
        headers: {
          'idempotency-key': `company-job-${Date.now()}-${sequence++}`,
        },
      },
    );
    expect(companyScopedJob.status, JSON.stringify(companyScopedJob.body)).toBe(201);
    expect(companyScopedJob.body.data).toMatchObject({
      companyId,
      branchId: khiBranchId,
      status: 'DRAFT',
    });

    const [branchAdminUser] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, 'branchadmin.khi@jobbank.local'));
    const companyJobs = await listCompanyJobs(await loadActor(branchAdminUser!.id), companyId);
    expect(companyJobs.map((item) => item.id)).toEqual(
      expect.arrayContaining([jobId, companyScopedJob.body.data.id]),
    );
    const globalJobs = await call(listJobsRoute, `/api/v1/jobs?companyId=${companyId}`, {
      jar: branchAdmin,
    });
    expect(globalJobs.body.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: jobId, companyId, status: 'CLOSED' }),
        expect.objectContaining({
          id: companyScopedJob.body.data.id,
          companyId,
          status: 'DRAFT',
        }),
      ]),
    );

    const replay = await call(registerCompanyRoute, '/api/v1/companies', {
      method: 'POST',
      body: input,
      jar: admin,
      headers: { 'idempotency-key': key },
    });
    expect(replay.status).toBe(201);
    expect(replay.body.data.id).toBe(companyId);

    const duplicate = await call(registerCompanyRoute, '/api/v1/companies', {
      method: 'POST',
      body: input,
      jar: admin,
      headers: { 'idempotency-key': idempotencyKey() },
    });
    expect(duplicate.status).toBe(409);
    expect(
      await db
        .select({ id: schema.companies.id })
        .from(schema.companies)
        .where(eq(schema.companies.ntn, input.ntn)),
    ).toHaveLength(1);

    const branchAdminResult = await call(registerCompanyRoute, '/api/v1/companies', {
      method: 'POST',
      body: registration(khiBranchId, randomNtn()),
      jar: branchAdmin,
      headers: { 'idempotency-key': idempotencyKey() },
    });
    expect(branchAdminResult.status, JSON.stringify(branchAdminResult.body)).toBe(403);
  });

  it('rejects unauthorized and cross-branch company creation', async () => {
    const branchAdmin = await signInAdmin('branchadmin.khi@jobbank.local');
    const crossBranchNtn = randomNtn();
    const crossBranch = await call(registerCompanyRoute, '/api/v1/companies', {
      method: 'POST',
      body: registration(lhrBranchId, crossBranchNtn),
      jar: branchAdmin,
      headers: { 'idempotency-key': idempotencyKey() },
    });
    expect(crossBranch.status).toBe(403);

    const staff = await signIn('staff.lhr@jobbank.local');
    const unauthorizedNtn = randomNtn();
    const unauthorized = await call(registerCompanyRoute, '/api/v1/companies', {
      method: 'POST',
      body: registration(lhrBranchId, unauthorizedNtn),
      jar: staff,
      headers: { 'idempotency-key': idempotencyKey() },
    });
    expect(unauthorized.status).toBe(403);

    const employer = await signIn('employer@jobbank.local');
    const employerNtn = randomNtn();
    const employerAttempt = await call(registerCompanyRoute, '/api/v1/companies', {
      method: 'POST',
      body: registration(khiBranchId, employerNtn),
      jar: employer,
      headers: { 'idempotency-key': idempotencyKey() },
    });
    expect(employerAttempt.status).toBe(403);

    const admin = await signInAdmin('superadmin@jobbank.local');
    const invalidPhoneNtn = randomNtn();
    const invalidPhoneInput = registration(khiBranchId, invalidPhoneNtn);
    invalidPhoneInput.contacts.items[0]!.phone = '+12025550123';
    const invalidPhone = await call(registerCompanyRoute, '/api/v1/companies', {
      method: 'POST',
      body: invalidPhoneInput,
      jar: admin,
      headers: { 'idempotency-key': idempotencyKey() },
    });
    expect(invalidPhone.status).toBe(422);

    expect(
      await db
        .select({ id: schema.companies.id })
        .from(schema.companies)
        .where(
          inArray(schema.companies.ntn, [
            crossBranchNtn,
            unauthorizedNtn,
            employerNtn,
            invalidPhoneNtn,
          ]),
        ),
    ).toHaveLength(0);
  });
});
