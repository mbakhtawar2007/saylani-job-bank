import { schema } from '@jobbank/db';
import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as claim } from '@/app/api/v1/companies/[id]/claim/route';
import { POST as markVerifiedSigned } from '@/app/api/v1/companies/[id]/registration-form/verified-signed/route';
import { POST as onboard } from '@/app/api/v1/companies/onboard/route';
import { GET as listCompanies } from '@/app/api/v1/companies/route';
import { resetMemoryRateLimits } from '@/domains/shared/rate-limit';
import { db } from '@/lib/db';
import { call, randomPhone, signIn, type Jar } from '@/test/api-client';

const randomNtn = () =>
  `${String(Math.floor(1000000 + Math.random() * 9000000))}-${Math.floor(Math.random() * 10)}`;
let idempotency = 0;
const key = () => `it-verifier-onboard-${Date.now()}-${idempotency++}`;

const branchId = async (code: string) =>
  (
    await db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.code, code))
  )[0]!.id;

let khi: string;
let verifierJar: Jar;
/** A second in-branch actor: M9 forbids the onboarder marking their own form. */
let colleagueJar: Jar;

beforeAll(async () => {
  khi = await branchId('KHI-GULSHAN');
  verifierJar = await signIn('verifier.khi@jobbank.local');
  colleagueJar = await signIn('branchadmin.khi@jobbank.local');
});
beforeEach(() => resetMemoryRateLimits());

/** Full field-visit form: company details, contact person, outreach, notes. */
const onboardBody = (overrides: Record<string, unknown> = {}) => ({
  branchId: khi,
  legalName: 'Verifier Onboard Test Textiles',
  legalStructure: 'PRIVATE_LIMITED',
  ntn: randomNtn(),
  industryCode: 'MANUFACTURING',
  sizeBand: '11_50',
  contactName: 'Bilal Contact',
  contactDesignation: 'HR Manager',
  contactPhone: randomPhone(),
  visitDate: new Date().toISOString().slice(0, 10),
  agreed: true,
  headOfficeAddress: 'Plot 12, SITE Area, Karachi',
  workforceRoles: 'Machine operators',
  additionalNotes: 'Met the HR manager on site.',
  ...overrides,
});

async function onboardedCompany(overrides: Record<string, unknown> = {}) {
  const res = await call(onboard, '/api/v1/companies/onboard', {
    method: 'POST',
    body: onboardBody(overrides),
    jar: verifierJar,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.data as { id: string; status: string };
}

describe('verifier creates companies', () => {
  it('onboards a company with company, contact-person and outreach details', async () => {
    const res = await call(onboard, '/api/v1/companies/onboard', {
      method: 'POST',
      body: onboardBody(),
      jar: verifierJar,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.status).toBe('DRAFT');
    expect(res.body.data.details.legalName).toBe('Verifier Onboard Test Textiles');
    expect(res.body.data.contacts[0].name).toBe('Bilal Contact');
    expect(res.body.data.onboarding.agreed).toBe(true);
    expect(res.body.data.onboarding.onboardedBy.roleLabel).toBe('Verification Officer');
    expect(res.body.data.onboarding.notes.headOfficeAddress).toBe('Plot 12, SITE Area, Karachi');
  });

  it('marks it verified & signed and it reaches the queue as SUBMITTED', async () => {
    const company = await onboardedCompany();
    // M9: the onboarder cannot mark their own paper form — a colleague in
    // the branch records it.
    const res = await call(
      markVerifiedSigned,
      `/api/v1/companies/${company.id}/registration-form/verified-signed`,
      { method: 'POST', jar: colleagueJar, params: { id: company.id } },
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.verifiedSigned).toBe(true);
    expect(res.body.data.status).toBe('SUBMITTED');
  });

  it('can claim — and so can verify — a company they onboarded', async () => {
    const company = await onboardedCompany();
    const signed = await call(
      markVerifiedSigned,
      `/api/v1/companies/${company.id}/registration-form/verified-signed`,
      { method: 'POST', jar: colleagueJar, params: { id: company.id } },
    );
    expect(signed.status, JSON.stringify(signed.body)).toBe(200);
    const res = await call(claim, `/api/v1/companies/${company.id}/claim`, {
      method: 'POST',
      jar: verifierJar,
      params: { id: company.id },
      headers: { 'Idempotency-Key': key() },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.status).toBe('UNDER_VERIFICATION');
  });

  it('sees only the companies they onboarded in the company list', async () => {
    const mine = await onboardedCompany();
    const otherJar = await signIn('branchadmin.khi@jobbank.local');
    const otherRes = await call(onboard, '/api/v1/companies/onboard', {
      method: 'POST',
      body: onboardBody({ legalName: 'Branch Admin Onboard Test Foods' }),
      jar: otherJar,
    });
    expect(otherRes.status, JSON.stringify(otherRes.body)).toBe(201);
    const res = await call(listCompanies, '/api/v1/companies', {
      method: 'GET',
      jar: verifierJar,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const ids = (res.body.data.items as { id: string }[]).map((c) => c.id);
    expect(ids).toContain(mine.id);
    expect(ids).not.toContain(otherRes.body.data.id);
  });
});
