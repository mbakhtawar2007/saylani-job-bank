import { schema } from '@jobbank/db';
import { eq, sql } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GET as listJobs } from '@/app/api/v1/jobs/route';
import { resetMemoryRateLimits } from '@/domains/shared/rate-limit';
import { db } from '@/lib/db';
import { call, signIn, type Jar } from '@/test/api-client';

const us = schema.users;
const co = schema.companies;
const j = schema.jobs;
const jl = schema.jobLocations;

const tag = Date.now().toString(36);

let KHI: string;
let staffJar: Jar;
let jobA: string;
let jobB: string;

beforeAll(async () => {
  KHI = (
    await db
      .select({ id: schema.branches.id })
      .from(schema.branches)
      .where(eq(schema.branches.code, 'KHI-GULSHAN'))
  )[0]!.id;

  const employerUserId = (
    await db.select({ id: us.id }).from(us).where(eq(us.email, 'employer@jobbank.local'))
  )[0]!.id;

  const company = (
    await db
      .insert(co)
      .values({
        branchId: KHI,
        legalName: `Search Filter Traders ${tag}`,
        legalStructure: 'PRIVATE_LIMITED',
        ntn: String(Math.floor(1e6 + Math.random() * 9e6)),
        industryCode: 'RETAIL',
        sizeBand: '1_10',
        status: 'VERIFIED',
        verifiedAt: new Date(),
        createdBy: employerUserId,
      })
      .returning({ id: co.id })
  )[0]!;
  const companyId = company.id;

  staffJar = await signIn('staff.khi@jobbank.local');

  const [a] = await db
    .insert(j)
    .values({
      companyId,
      branchId: KHI,
      title: `Delivery Rider ${tag}`,
      categoryCode: 'DRIVING_DELIVERY',
      description: 'Deliver parcels across Gulshan.',
      jobType: 'FULL_TIME',
      shift: 'DAY',
      vacancies: 3,
      status: 'OPEN',
      createdBy: employerUserId,
    })
    .returning({ id: j.id });
  jobA = a!.id;
  await db.insert(jl).values({
    jobId: jobA,
    addressLine: 'Gulshan-e-Iqbal, Karachi',
    cityCode: 'KARACHI',
    location: sql`ST_SetSRID(ST_MakePoint(67.0899, 24.9256), 4326)::geography`,
  });

  const [b] = await db
    .insert(j)
    .values({
      companyId,
      branchId: KHI,
      title: `Night Security Guard ${tag}`,
      categoryCode: 'SECURITY',
      description: 'Guard the warehouse overnight.',
      jobType: 'PART_TIME',
      shift: 'NIGHT',
      vacancies: 2,
      status: 'PAUSED',
      createdBy: employerUserId,
    })
    .returning({ id: j.id });
  jobB = b!.id;
  await db.insert(jl).values({
    jobId: jobB,
    addressLine: 'Johar Town, Lahore',
    cityCode: 'LAHORE',
    location: sql`ST_SetSRID(ST_MakePoint(74.2728, 31.4697), 4326)::geography`,
  });
});

beforeEach(() => resetMemoryRateLimits());

describe('job search and filtering', () => {
  const find = async (qs: string) =>
    (await call(listJobs, `/api/v1/jobs?${qs}`, { jar: staffJar })).body.data.items as {
      id: string;
      companyName: string | null;
      cityLabel: string | null;
    }[];
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

  it('searches titles, descriptions and company names', async () => {
    expect(ids(await find(`q=${encodeURIComponent(`Delivery Rider ${tag}`)}`))).toEqual([jobA]);
    expect(ids(await find('q=warehouse'))).toContain(jobB);
    expect(ids(await find('q=warehouse'))).not.toContain(jobA);
    expect(ids(await find(`q=${encodeURIComponent(`Search Filter Traders ${tag}`)}`))).toEqual(
      expect.arrayContaining([jobA, jobB]),
    );
  });

  it('filters by status, type, category, shift and location city', async () => {
    expect(ids(await find('status=PAUSED'))).toContain(jobB);
    expect(ids(await find('status=PAUSED'))).not.toContain(jobA);
    expect(ids(await find('status=OPEN'))).toContain(jobA);
    expect(ids(await find('jobType=PART_TIME'))).toContain(jobB);
    expect(ids(await find('jobType=PART_TIME'))).not.toContain(jobA);
    expect(ids(await find('categoryCode=SECURITY'))).toContain(jobB);
    expect(ids(await find('categoryCode=SECURITY'))).not.toContain(jobA);
    expect(ids(await find('shift=NIGHT'))).toContain(jobB);
    expect(ids(await find('shift=NIGHT'))).not.toContain(jobA);
    expect(ids(await find('cityCode=LAHORE'))).toContain(jobB);
    expect(ids(await find('cityCode=LAHORE'))).not.toContain(jobA);
    expect(ids(await find('cityCode=KARACHI'))).toContain(jobA);
    expect(ids(await find('cityCode=KARACHI'))).not.toContain(jobB);
  });

  it('combines filters, and returns company and city on each row', async () => {
    const openKhi = await find('status=OPEN&cityCode=KARACHI');
    expect(ids(openKhi)).toContain(jobA);
    expect(ids(await find('status=OPEN&cityCode=LAHORE'))).not.toContain(jobA);
    expect(ids(await find('status=OPEN&cityCode=LAHORE'))).not.toContain(jobB);

    const rowA = openKhi.find((r) => r.id === jobA)!;
    expect(rowA.companyName).toContain(`Search Filter Traders ${tag}`);
    expect(rowA.cityLabel).toEqual(expect.any(String));
  });

  it('rejects an unknown filter value instead of silently returning everything', async () => {
    expect((await call(listJobs, '/api/v1/jobs?jobType=BOGUS', { jar: staffJar })).status).toBe(
      422,
    );
  });
});
