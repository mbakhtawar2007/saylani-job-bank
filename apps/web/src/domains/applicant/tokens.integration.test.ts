import { schema } from '@jobbank/db';
import { and, eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as issueToken } from '@/app/api/v1/applicants/tokens/route';
import { POST as staffRegister } from '@/app/api/v1/applicants/route';
import { resetMemoryRateLimits } from '@/domains/shared/rate-limit';
import { db } from '@/lib/db';
import { call, randomPhone, signIn, type Jar } from '@/test/api-client';

const randomCnic = () => `42${String(Math.floor(Math.random() * 1e11)).padStart(11, '0')}`;

const branchId = async (code: string) =>
  (
    await db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.code, code))
  )[0]!.id;

let khi: string;
let lhr: string;
let staffJar: Jar;

beforeAll(async () => {
  khi = await branchId('KHI-GULSHAN');
  lhr = await branchId('LHR-JOHAR');
  staffJar = await signIn('staff.khi@jobbank.local');
});
beforeEach(() => resetMemoryRateLimits());

async function issue(branchId: string, cnic: string, jar = staffJar) {
  return call(issueToken, '/api/v1/applicants/tokens', {
    method: 'POST',
    body: { branchId, cnic, applicantName: 'Ahmed Raza', phone: randomPhone() },
    jar,
  });
}

describe('first-counter applicant tokens', () => {
  it('issues token 1 for a fresh CNIC, then 2 for the next person', async () => {
    const first = await issue(khi, randomCnic());
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body.data).toMatchObject({
      tokenNumber: 1,
      tokenCode: 'KHI-GULSHAN-001',
      branchId: khi,
      status: 'ISSUED',
      applicantId: null,
    });
    expect(first.body.data.phone).toMatch(/^\+92345\d{7}$/);
    expect(first.body.data.issuedAt).toEqual(expect.any(String));

    const second = await issue(khi, randomCnic());
    expect(second.status, JSON.stringify(second.body)).toBe(201);
    expect(second.body.data.tokenNumber).toBe(2);
    expect(second.body.data.tokenCode).toBe('KHI-GULSHAN-002');
  });

  it('returns the same token when the same CNIC is issued twice in a day', async () => {
    const cnic = randomCnic();
    const first = await issue(khi, cnic);
    expect(first.status).toBe(201);
    const again = await issue(khi, cnic);
    expect(again.status).toBe(201);
    expect(again.body.data.id).toBe(first.body.data.id);
    expect(again.body.data.tokenNumber).toBe(first.body.data.tokenNumber);
  });

  it('refuses a token for a CNIC that already has a profile', async () => {
    const cnic = randomCnic();
    const registered = await call(staffRegister, '/api/v1/applicants', {
      method: 'POST',
      body: {
        fullName: 'Ayesha Khan',
        fatherName: 'Imran Khan',
        cnic,
        dateOfBirth: '1998-04-12',
        gender: 'FEMALE',
        email: '',
        phone: randomPhone(),
        branchId: khi,
      },
      jar: staffJar,
    });
    expect(registered.status, JSON.stringify(registered.body)).toBe(201);

    const response = await issue(khi, cnic);
    expect(response.status).toBe(409);
    expect(response.body.error.details.reason).toBe('CNIC_TAKEN');
  });

  it('rejects a token for a branch outside the staff member’s scope', async () => {
    const response = await issue(lhr, randomCnic());
    expect(response.status).toBe(403);
  });

  it('audits the issuance', async () => {
    const cnic = randomCnic();
    const response = await issue(khi, cnic);
    expect(response.status).toBe(201);
    const [audit] = await db
      .select()
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.action, 'applicant.token_issued'),
          eq(schema.auditLogs.entityId, response.body.data.id as string),
        ),
      );
    expect(audit).toMatchObject({ branchId: khi });
  });
});
