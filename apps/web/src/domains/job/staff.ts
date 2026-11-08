import 'server-only';
import {
  JOB_STATUSES,
  JOB_TYPES,
  SHIFT_TYPES,
  type CreateJobInput,
  type JobStatus,
  type JobType,
  type ShiftType,
} from '@jobbank/shared';
import { and, asc, count, desc, eq, exists, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { runCommand } from '@/domains/shared/audit';
import { ForbiddenError, NotFoundError, ValidationError } from '@/domains/shared/errors';
import { multiCode, multiEnum } from '@/domains/shared/filters';
import { paginationMeta, type ListQuery } from '@/domains/shared/pagination';
import {
  assertCityAccess,
  assertPermission,
  cityScope,
  hasPermission,
  type Actor,
} from '@/domains/shared/scope';
import { db } from '@/lib/db';
import type { RequestContext } from '@/domains/shared/audit';
import { masterDataLabels } from '@/domains/settings';
import { schema } from '@jobbank/db';
import { buildJobView, j, loadJob, type JobView } from './repository';
import { jobMachine } from './machine';

type SignedIn = RequestContext & { actor: Actor };

// ─── Listing ─────────────────────────────────────────────────────────────

export const JOB_SORTABLE = ['title', 'createdAt', 'status', 'vacancies'] as const;

export const jobFilters = {
  /** Multi-select (Daraz/OLX-style checkboxes): one repeated key per ticked box. */
  status: multiEnum(JOB_STATUSES),
  companyId: z.uuid().optional(),
  branchId: z.uuid().optional(),
  jobType: multiEnum(JOB_TYPES),
  categoryCode: multiCode,
  /** City of any of the job's locations. */
  cityCode: multiCode,
  shift: multiEnum(SHIFT_TYPES),
  /**
   * Daraz-style price range, for salaries (PKR / month). A job matches when its
   * salary range overlaps the requested one; jobs with no salary listed never
   * match a salary filter. Empty query values are ignored, not read as 0.
   */
  salaryMin: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.coerce.number().int().min(0).max(100_000_000).optional(),
  ),
  salaryMax: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.coerce.number().int().min(0).max(100_000_000).optional(),
  ),
};

export interface JobListItem {
  id: string;
  companyId: string;
  companyName: string | null;
  branchId: string;
  title: string;
  categoryCode: string;
  jobType: string;
  vacancies: number;
  vacanciesFilled: number;
  status: JobStatus;
  /** Label of the first location's city, if the job has a location. */
  cityLabel: string | null;
  publishedAt: string | null;
  createdAt: string;
}

export async function listJobs(
  actor: Actor,
  query: ListQuery<
    (typeof JOB_SORTABLE)[number],
    {
      status?: JobStatus[];
      companyId?: string;
      branchId?: string;
      jobType?: JobType[];
      categoryCode?: string[];
      cityCode?: string[];
      shift?: ShiftType[];
      salaryMin?: number;
      salaryMax?: number;
    }
  >,
) {
  assertPermission(actor, 'job:read');
  const f = query.filters;
  if (f.salaryMin !== undefined && f.salaryMax !== undefined && f.salaryMin > f.salaryMax) {
    throw new ValidationError([
      { path: 'salaryMin', message: 'Minimum salary must not be more than maximum salary' },
    ]);
  }

  const conditions: SQL[] = [];

  // City scope — all staff in any branch of the same city see all jobs for that city
  const scopeCondition = cityScope(actor, j.branchId);
  if (scopeCondition) conditions.push(scopeCondition);

  // Employers see only their own company's listings through this staff
  // endpoint. Without this, an employer with a branch assignment would see
  // every job in the city. (Their own UI uses listJobsForEmployer instead;
  // a pure-employer actor has a company but neither job:manage nor job:refer.)
  if (
    actor.companyId &&
    !hasPermission(actor, 'job:manage') &&
    !hasPermission(actor, 'job:refer')
  ) {
    conditions.push(eq(j.companyId, actor.companyId));
  }

  if (f.status?.length) conditions.push(inArray(j.status, f.status));
  if (f.companyId) conditions.push(eq(j.companyId, f.companyId));
  if (f.branchId) conditions.push(eq(j.branchId, f.branchId));
  if (f.jobType?.length) conditions.push(inArray(j.jobType, f.jobType));
  if (f.categoryCode?.length) conditions.push(inArray(j.categoryCode, f.categoryCode));
  if (f.shift?.length) conditions.push(inArray(j.shift, f.shift));
  if (f.cityCode?.length) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(schema.jobLocations)
          .where(
            and(
              eq(schema.jobLocations.jobId, j.id),
              inArray(schema.jobLocations.cityCode, f.cityCode),
            ),
          ),
      ),
    );
  }
  if (f.salaryMin !== undefined || f.salaryMax !== undefined) {
    // Salary-range overlap: a missing bound is open-ended, but a job with no
    // salary listed at all does not match a salary filter.
    const min = f.salaryMin ?? 0;
    const max = f.salaryMax ?? 100_000_000;
    conditions.push(
      sql`(${j.salaryMin} IS NOT NULL OR ${j.salaryMax} IS NOT NULL) AND (${j.salaryMin} IS NULL OR ${j.salaryMin} <= ${max}) AND (${j.salaryMax} IS NULL OR ${j.salaryMax} >= ${min})`,
    );
  }
  if (query.q) {
    const like = `%${query.q}%`;
    conditions.push(
      or(
        ilike(j.title, like),
        ilike(j.description, like),
        ilike(j.categoryCode, like),
        // Company name lives on the companies table; an EXISTS keeps the
        // count query (which has no companies join) working too.
        exists(
          db
            .select({ one: sql`1` })
            .from(schema.companies)
            .where(
              and(
                eq(schema.companies.id, j.companyId),
                or(
                  ilike(schema.companies.legalName, like),
                  ilike(schema.companies.tradeName, like),
                ),
              ),
            ),
        ),
      )!,
    );
  }

  const where = conditions.length ? and(...conditions) : undefined;

  const sortCol = {
    title: j.title,
    createdAt: j.createdAt,
    status: j.status,
    vacancies: j.vacancies,
  }[query.sort.field];
  const orderBy = query.sort.direction === 'asc' ? asc(sortCol) : desc(sortCol);

  const [[totRow], rows] = await Promise.all([
    db.select({ total: count() }).from(j).where(where),
    db
      .select({
        id: j.id,
        companyId: j.companyId,
        companyLegalName: schema.companies.legalName,
        companyTradeName: schema.companies.tradeName,
        branchId: j.branchId,
        title: j.title,
        categoryCode: j.categoryCode,
        jobType: j.jobType,
        vacancies: j.vacancies,
        vacanciesFilled: j.vacanciesFilled,
        status: j.status,
        publishedAt: j.publishedAt,
        createdAt: j.createdAt,
      })
      .from(j)
      .leftJoin(schema.companies, eq(schema.companies.id, j.companyId))
      .where(where)
      .orderBy(orderBy)
      .limit(query.limit)
      .offset(query.offset),
  ]);

  // First location city per job on this page, for the list rows.
  const ids = rows.map((r) => r.id);
  const [locations, labels] =
    ids.length > 0
      ? await Promise.all([
          db
            .select({
              jobId: schema.jobLocations.jobId,
              cityCode: schema.jobLocations.cityCode,
            })
            .from(schema.jobLocations)
            .where(inArray(schema.jobLocations.jobId, ids)),
          masterDataLabels(['CITY']),
        ])
      : [[], { CITY: {} as Record<string, string> }];
  const cityByJob = new Map<string, string>();
  for (const loc of locations) {
    if (!cityByJob.has(loc.jobId)) {
      cityByJob.set(loc.jobId, labels.CITY?.[loc.cityCode] ?? loc.cityCode);
    }
  }

  const items: JobListItem[] = rows.map(({ companyLegalName, companyTradeName, ...r }) => ({
    ...r,
    companyName: companyTradeName ?? companyLegalName,
    status: r.status as JobStatus,
    cityLabel: cityByJob.get(r.id) ?? null,
    publishedAt: r.publishedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));

  return { items, pagination: paginationMeta(query, totRow?.total ?? 0) };
}

// ─── Detail ───────────────────────────────────────────────────────────────

export async function getJobDetail(actor: Actor, jobId: string): Promise<JobView> {
  assertPermission(actor, 'job:read');
  const row = await loadJob(db, jobId);
  // Same own-company rule as listJobs: a pure-employer actor sees only
  // their own company's jobs here.
  if (
    actor.companyId &&
    !hasPermission(actor, 'job:manage') &&
    !hasPermission(actor, 'job:refer') &&
    row.companyId !== actor.companyId
  ) {
    throw new NotFoundError('Job', jobId);
  }
  await assertCityAccess(actor, row.branchId, { entityType: 'job', entityId: row.id });
  return buildJobView(db, row);
}

// ─── Staff job creation ───────────────────────────────────────────────────

/** Branch Admin or Super Admin posts a job on behalf of a verified company. */
export async function staffCreateJob(
  ctx: SignedIn,
  companyId: string,
  input: CreateJobInput,
): Promise<JobView> {
  assertPermission(ctx.actor, 'job:manage');
  const [company] = await db
    .select({
      id: schema.companies.id,
      branchId: schema.companies.branchId,
      status: schema.companies.status,
    })
    .from(schema.companies)
    .where(eq(schema.companies.id, companyId));
  if (!company) throw new NotFoundError('Company', companyId);
  if (company.status !== 'VERIFIED')
    throw new ForbiddenError('Jobs can only be posted for verified companies');
  if (!company.branchId) throw new ForbiddenError('Company has no branch assigned');
  await assertCityAccess(ctx.actor, company.branchId, {
    entityType: 'company',
    entityId: company.id,
  });

  return runCommand(ctx, async ({ tx, audit }) => {
    const [row] = await tx
      .insert(j)
      .values({
        companyId: company.id,
        branchId: company.branchId!,
        title: input.title,
        categoryCode: input.categoryCode,
        description: input.description,
        jobType: input.jobType,
        shift: input.shift,
        genderPreference: input.genderPreference ?? 'ANY',
        vacancies: input.vacancies,
        salaryMin: input.salaryMin ?? null,
        salaryMax: input.salaryMax ?? null,
        status: 'DRAFT',
        closesAt: input.closesAt ? new Date(input.closesAt) : null,
        fuelAllowance: input.fuelAllowance ?? false,
        flexibleHours: input.flexibleHours ?? false,
        annualLeaveDays: input.annualLeaveDays ?? null,
        medicalCoverage: input.medicalCoverage ?? 'NONE',
        bonusTier: input.bonusTier ?? 'NONE',
        workFromHome: input.workFromHome ?? false,
        providentFund: input.providentFund ?? false,
        transportAllowance: input.transportAllowance ?? false,
        eobi: input.eobi ?? false,
        lifeInsurance: input.lifeInsurance ?? false,
        createdBy: ctx.actor.userId,
      })
      .returning();
    audit({
      action: 'job.staff_create',
      entityType: 'job',
      entityId: row!.id,
      branchId: company.branchId,
    });
    return row!;
  }).then((row) => buildJobView(db, row));
}

// ─── Staff status override ────────────────────────────────────────────────

export async function forceCloseJob(ctx: SignedIn, jobId: string, note?: string): Promise<JobView> {
  if (!hasPermission(ctx.actor, 'company:manage') && !hasPermission(ctx.actor, 'company:read')) {
    throw new ForbiddenError('Only branch staff can force-close jobs');
  }

  return runCommand(ctx, async ({ tx, audit }) => {
    const row = await loadJob(tx, jobId, { forUpdate: true });
    const check = jobMachine.check(row.status, 'CLOSE', {}, ctx.actor.roles);
    if (!check.ok) throw new ForbiddenError(check.message);

    const [updated] = await tx
      .update(j)
      .set({ status: 'CLOSED', closedAt: new Date(), updatedAt: new Date() })
      .where(eq(j.id, jobId))
      .returning();

    audit({
      action: 'job.staff_close',
      entityType: 'job',
      entityId: jobId,
      before: { status: row.status },
      after: { status: 'CLOSED' },
      reason: note ?? null,
    });
    return updated!;
  }).then((row) => buildJobView(db, row));
}
