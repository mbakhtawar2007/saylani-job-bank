import 'server-only';
import {
  deriveMedicalCoverage,
  EXPERIENCE_LEVEL_MIN_MONTHS,
  experienceLevelToMinYears,
  type CreateJobInput,
  type JobLocationInput,
  type JobRequirementsInput,
  type JobSkillsInput,
  type JobStatusInput,
  type MedicalCoverageType,
  type PaginationMeta,
  type UpdateJobInput,
} from '@jobbank/shared';
import { count, desc, eq, sql } from 'drizzle-orm';
import { schema } from '@jobbank/db';
import { requireOwnCompany } from '@/domains/company';
import { enqueueJobMatch } from '@/domains/matching';
import { runCommand } from '@/domains/shared/audit';
import { ForbiddenError, NotFoundError, ValidationError } from '@/domains/shared/errors';
import { paginationMeta, type ListQuery } from '@/domains/shared/pagination';
import { assertPermission, type Actor } from '@/domains/shared/scope';
import { assertActiveMasterData } from '@/domains/settings';
import { db } from '@/lib/db';
import type { RequestContext } from '@/domains/shared/audit';
import { jobMachine } from './machine';
import { buildJobView, j, jl, jr, js, loadJob, jobsByCompany, type JobView } from './repository';
import {
  assertCompanyNotSuspended,
  assertDesignationSalaryRange,
  assertJobUpdateReferencesValid,
  assertMergedJobUpdateValid,
  jobEditability,
  mergedMedicalCoverage,
} from './rules';

type SignedIn = RequestContext & { actor: Actor };

/** Legacy cover value for a job: explicit value wins, else derived from the OPD / IPD limits. */
function resolveMedicalCoverage(input: {
  medicalCoverage?: MedicalCoverageType;
  opdLimit?: number | null;
  ipdLimit?: number | null;
}): MedicalCoverageType {
  if (input.opdLimit != null || input.ipdLimit != null) {
    return deriveMedicalCoverage(input.opdLimit, input.ipdLimit);
  }
  return input.medicalCoverage ?? 'NONE';
}

// ─── Queries ────────────────────────────────────────────────────────────

export async function getMyJob(actor: Actor, jobId: string): Promise<JobView> {
  assertPermission(actor, 'job:manage_own');
  const company = await requireOwnCompany(db, actor);
  const row = await loadJob(db, jobId);
  if (row.companyId !== company.id) throw new NotFoundError('Job', jobId);
  return buildJobView(db, row);
}

export async function listMyJobs(actor: Actor): Promise<JobView[]>;
export async function listMyJobs(
  actor: Actor,
  query: Pick<
    ListQuery<'createdAt', Record<string, never>>,
    'page' | 'pageSize' | 'offset' | 'limit'
  >,
): Promise<{ items: JobView[]; pagination: PaginationMeta }>;
export async function listMyJobs(
  actor: Actor,
  query?: Pick<
    ListQuery<'createdAt', Record<string, never>>,
    'page' | 'pageSize' | 'offset' | 'limit'
  >,
): Promise<JobView[] | { items: JobView[]; pagination: PaginationMeta }> {
  assertPermission(actor, 'job:manage_own');
  const company = await requireOwnCompany(db, actor);
  // M32: with a parsed ListQuery, return one page plus pagination metadata
  // (ids first, then buildJobView only for the page). Without a query the
  // full list is returned, as before.
  if (!query) {
    const rows = await jobsByCompany(db, company.id);
    return Promise.all(rows.map((r) => buildJobView(db, r)));
  }
  const [[totRow], rows] = await Promise.all([
    db.select({ total: count() }).from(j).where(eq(j.companyId, company.id)),
    db
      .select()
      .from(j)
      .where(eq(j.companyId, company.id))
      .orderBy(desc(j.createdAt))
      .limit(query.limit)
      .offset(query.offset),
  ]);
  return {
    items: await Promise.all(rows.map((r) => buildJobView(db, r))),
    pagination: paginationMeta(query, totRow?.total ?? 0),
  };
}

// ─── Create / update ────────────────────────────────────────────────────

export async function createJob(ctx: SignedIn, input: CreateJobInput): Promise<JobView> {
  assertPermission(ctx.actor, 'job:manage_own');
  const company = await requireOwnCompany(db, ctx.actor);
  if (!company.branchId) throw new ForbiddenError('Company must have a branch before posting jobs');
  if (company.status !== 'VERIFIED')
    throw new ForbiddenError('Only verified companies can post jobs');

  return runCommand(ctx, async ({ tx, audit }) => {
    // Re-check inside the transaction: a suspension landing between the
    // read above and the insert must not let an unverified job through.
    const fresh = await requireOwnCompany(tx, ctx.actor, { forUpdate: true });
    if (fresh.status !== 'VERIFIED')
      throw new ForbiddenError('Only verified companies can post jobs');
    // C4/H13: the category must be a real, active master-data code.
    await assertActiveMasterData(tx, 'JOB_CATEGORY', [input.categoryCode], () => 'categoryCode');
    await assertDesignationSalaryRange(tx, input.designationCode, input.salaryMin, input.salaryMax);
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
        shiftHours: input.shiftHours ?? null,
        designationCode: input.designationCode ?? null,
        genderPreference: input.genderPreference ?? 'ANY',
        vacancies: input.vacancies,
        salaryMin: input.salaryMin ?? null,
        salaryMax: input.salaryMax ?? null,
        status: 'DRAFT',
        closesAt: input.closesAt ? new Date(input.closesAt) : null,
        fuelAllowance: input.fuelAllowance ?? false,
        flexibleHours: input.flexibleHours ?? false,
        annualLeaveDays: input.annualLeaveDays ?? null,
        sickLeaveDays: input.sickLeaveDays ?? null,
        casualLeaveDays: input.casualLeaveDays ?? null,
        medicalCoverage: resolveMedicalCoverage(input),
        opdLimit: input.opdLimit ?? null,
        ipdLimit: input.ipdLimit ?? null,
        medicalCoverageScope: input.medicalCoverageScope ?? null,
        bonusTier: input.bonusTier ?? 'NONE',
        bonusBasis: input.bonusBasis ?? null,
        bonusAmountPkr: input.bonusAmountPkr ?? null,
        bonusFrequency: input.bonusFrequency ?? null,
        workFromHome: input.workFromHome ?? false,
        providentFund: input.providentFund ?? false,
        transportAllowance: input.transportAllowance ?? false,
        eobi: input.eobi ?? false,
        lifeInsurance: input.lifeInsurance ?? false,
        createdBy: ctx.actor.userId,
      })
      .returning();
    audit({ action: 'job.create', entityType: 'job', entityId: row!.id });
    return row!;
  }).then((row) => buildJobView(db, row));
}

export async function updateJob(
  ctx: SignedIn,
  jobId: string,
  input: UpdateJobInput,
): Promise<JobView> {
  assertPermission(ctx.actor, 'job:manage_own');
  const company = await requireOwnCompany(db, ctx.actor);
  const row = await loadJob(db, jobId);
  if (row.companyId !== company.id) throw new NotFoundError('Job', jobId);
  // Audit 2026-11-11 (L-26): suspension freezes job edits.
  assertCompanyNotSuspended(company.status);
  if (jobEditability(row.status) !== 'editable') {
    throw new ForbiddenError('Job can only be edited while in DRAFT, OPEN, or PAUSED status');
  }

  // 2026-11-12: the company may fully edit its own job in any editable
  // status — the old referral-workflow §3 field restrictions on OPEN /
  // PAUSED jobs were lifted by user decision. The company itself is still
  // never changeable here: updateJobSchema carries no companyId and the
  // update below never writes it.
  // M16 / audit 2026-11-11 (M-25): the salary refine must run against the
  // MERGED (stored + incoming) values — updateJobSchema is a bare .partial(),
  // so a PATCH that only sets salaryMin above the stored salaryMax would
  // otherwise pass. Shared with the staff path (rules.ts).
  assertMergedJobUpdateValid(input, row);

  return runCommand(ctx, async ({ tx, audit }) => {
    // H13 / M-25: category + designation-range checks, shared with the
    // staff path (rules.ts).
    await assertJobUpdateReferencesValid(tx, input, row);
    // A changed OPD / IPD limit re-derives the legacy cover label.
    const derivedCoverage = mergedMedicalCoverage(input, row);
    const [updated] = await tx
      .update(j)
      .set({
        ...(input.title !== undefined && { title: input.title }),
        ...(input.categoryCode !== undefined && { categoryCode: input.categoryCode }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.jobType !== undefined && { jobType: input.jobType }),
        ...(input.shift !== undefined && { shift: input.shift }),
        ...(input.shiftHours !== undefined && { shiftHours: input.shiftHours }),
        ...(input.designationCode !== undefined && {
          designationCode: input.designationCode,
        }),
        ...(input.genderPreference !== undefined && { genderPreference: input.genderPreference }),
        ...(input.vacancies !== undefined && { vacancies: input.vacancies }),
        ...(input.salaryMin !== undefined && { salaryMin: input.salaryMin }),
        ...(input.salaryMax !== undefined && { salaryMax: input.salaryMax }),
        ...(input.closesAt !== undefined && {
          closesAt: input.closesAt ? new Date(input.closesAt) : null,
        }),
        ...(input.fuelAllowance !== undefined && { fuelAllowance: input.fuelAllowance }),
        ...(input.flexibleHours !== undefined && { flexibleHours: input.flexibleHours }),
        ...(input.annualLeaveDays !== undefined && { annualLeaveDays: input.annualLeaveDays }),
        ...(input.sickLeaveDays !== undefined && { sickLeaveDays: input.sickLeaveDays }),
        ...(input.casualLeaveDays !== undefined && { casualLeaveDays: input.casualLeaveDays }),
        ...(input.medicalCoverage !== undefined && { medicalCoverage: input.medicalCoverage }),
        ...(derivedCoverage !== undefined && { medicalCoverage: derivedCoverage }),
        ...(input.opdLimit !== undefined && { opdLimit: input.opdLimit }),
        ...(input.ipdLimit !== undefined && { ipdLimit: input.ipdLimit }),
        ...(input.medicalCoverageScope !== undefined && {
          medicalCoverageScope: input.medicalCoverageScope,
        }),
        ...(input.bonusTier !== undefined && { bonusTier: input.bonusTier }),
        ...(input.bonusBasis !== undefined && { bonusBasis: input.bonusBasis }),
        ...(input.bonusAmountPkr !== undefined && { bonusAmountPkr: input.bonusAmountPkr }),
        ...(input.bonusFrequency !== undefined && { bonusFrequency: input.bonusFrequency }),
        ...(input.workFromHome !== undefined && { workFromHome: input.workFromHome }),
        ...(input.providentFund !== undefined && { providentFund: input.providentFund }),
        ...(input.transportAllowance !== undefined && {
          transportAllowance: input.transportAllowance,
        }),
        ...(input.eobi !== undefined && { eobi: input.eobi }),
        ...(input.lifeInsurance !== undefined && { lifeInsurance: input.lifeInsurance }),
        updatedAt: new Date(),
      })
      .where(eq(j.id, jobId))
      .returning();
    audit({ action: 'job.update', entityType: 'job', entityId: jobId });
    return updated!;
  }).then((row) => buildJobView(db, row));
}

export async function deleteJob(ctx: SignedIn, jobId: string): Promise<void> {
  assertPermission(ctx.actor, 'job:manage_own');
  const company = await requireOwnCompany(db, ctx.actor);
  const row = await loadJob(db, jobId);
  if (row.companyId !== company.id) throw new NotFoundError('Job', jobId);
  if (row.status !== 'DRAFT') throw new ForbiddenError('Only DRAFT jobs can be deleted');

  await runCommand(ctx, async ({ tx, audit }) => {
    await tx.delete(j).where(eq(j.id, jobId));
    audit({ action: 'job.delete', entityType: 'job', entityId: jobId });
  });
}

// ─── Status transitions ──────────────────────────────────────────────────

export async function transitionJobStatus(
  ctx: SignedIn,
  jobId: string,
  input: JobStatusInput,
): Promise<JobView> {
  assertPermission(ctx.actor, 'job:manage_own');
  const company = await requireOwnCompany(db, ctx.actor);

  return runCommand(ctx, async ({ tx, audit }) => {
    const row = await loadJob(tx, jobId, { forUpdate: true });
    if (row.companyId !== company.id) throw new NotFoundError('Job', jobId);

    const event =
      input.status === 'OPEN'
        ? row.status === 'DRAFT'
          ? 'PUBLISH'
          : row.status === 'CLOSED'
            ? 'REOPEN'
            : 'RESUME'
        : input.status === 'PAUSED'
          ? 'PAUSE'
          : 'CLOSE';

    // Going live (publish / reopen / resume) requires a verified company;
    // pausing or closing a job is always safe and stays allowed, so a
    // suspended company can still take its listings down. Re-checked
    // in-transaction against the locked company row.
    if (event === 'PUBLISH' || event === 'REOPEN' || event === 'RESUME') {
      const fresh = await requireOwnCompany(tx, ctx.actor, { forUpdate: true });
      if (fresh.status !== 'VERIFIED')
        throw new ForbiddenError('Only verified companies can publish jobs');
    }

    // C4: going live requires a complete listing — an active category, a
    // saved location, and a closing date that is null or still in the
    // future. The wizard's "location required" text is advisory only; this
    // server-side guard is the backstop.
    if (event === 'PUBLISH' || event === 'REOPEN' || event === 'RESUME') {
      const [location] = await tx
        .select({ id: jl.id })
        .from(jl)
        .where(eq(jl.jobId, jobId))
        .limit(1);
      const publishIssues: { path: string; message: string }[] = [];
      if (row.closesAt && row.closesAt.getTime() <= Date.now()) {
        publishIssues.push({
          path: 'closesAt',
          message: 'Closing date has passed; set a future date before publishing',
        });
      }
      if (!location) {
        publishIssues.push({
          path: 'location',
          message: 'Add a work location before publishing',
        });
      }
      try {
        await assertActiveMasterData(tx, 'JOB_CATEGORY', [row.categoryCode], () => 'categoryCode');
      } catch (error) {
        if (error instanceof ValidationError) publishIssues.push(...error.issues);
        else throw error;
      }
      if (publishIssues.length > 0) throw new ValidationError(publishIssues);
    }

    const check = jobMachine.check(row.status, event, {}, ctx.actor.roles);
    if (!check.ok) throw new ForbiddenError(check.message);

    const now = new Date();
    const [updated] = await tx
      .update(j)
      .set({
        status: check.to,
        publishedAt: check.to === 'OPEN' && !row.publishedAt ? now : row.publishedAt,
        // Audit 2026-11-10 (C-F6): reopening used to keep the old closedAt,
        // so a live OPEN job rendered "Closed <old date>" in the header.
        closedAt: check.to === 'CLOSED' ? now : check.to === 'OPEN' ? null : row.closedAt,
        reopenedAt: event === 'REOPEN' ? now : row.reopenedAt,
        updatedAt: now,
      })
      .where(eq(j.id, jobId))
      .returning();

    audit({
      action: `job.${event.toLowerCase()}`,
      entityType: 'job',
      entityId: jobId,
      before: { status: row.status },
      after: { status: check.to },
      reason: input.note ?? null,
    });

    // Auto matching: going OPEN (publish or resume) queues a shortlist rebuild.
    // The Python worker (services/matching) claims the outbox row and runs it.
    if (check.to === 'OPEN') {
      await enqueueJobMatch(tx, jobId, event === 'PUBLISH' ? 'PUBLISH' : 'RESUME');
    }
    return updated!;
  }).then((row) => buildJobView(db, row));
}

// ─── Sub-resource: location ──────────────────────────────────────────────

export async function setJobLocation(
  ctx: SignedIn,
  jobId: string,
  input: JobLocationInput,
): Promise<JobView> {
  assertPermission(ctx.actor, 'job:manage_own');
  const company = await requireOwnCompany(db, ctx.actor);
  const row = await loadJob(db, jobId);
  if (row.companyId !== company.id) throw new NotFoundError('Job', jobId);
  // Audit 2026-11-11 (L-26): suspension freezes job edits.
  assertCompanyNotSuspended(company.status);
  // M29: location can only change while the job is editable.
  if (jobEditability(row.status) !== 'editable') {
    throw new ForbiddenError(
      'Job location can only be changed while in DRAFT, OPEN, or PAUSED status',
    );
  }
  // 2026-11-12: the company may change the location of its own job in any
  // editable status — the old §3 staff-only location rule was lifted.
  return runCommand(ctx, async ({ tx, audit }) => {
    // C5: resolve the location to SAVE before deleting anything. A body
    // that carries no location data must never delete the job's only
    // location (the route schema already rejects it; this is the backstop).
    // A saved company location must belong to this employer's company —
    // its stored address/city/pin are used, never caller-supplied values
    // for another company's row.
    let addressLine: string;
    let cityCode: string;
    let lat: number;
    let lng: number;
    if (input.companyLocationId) {
      const [saved] = await tx
        .select()
        .from(schema.companyLocations)
        .where(eq(schema.companyLocations.id, input.companyLocationId));
      if (!saved || saved.companyId !== company.id)
        throw new NotFoundError('Company location', input.companyLocationId);
      if (saved.archivedAt) {
        throw new ValidationError([
          { path: 'companyLocationId', message: 'This company location is archived' },
        ]);
      }
      addressLine = saved.addressLine;
      cityCode = saved.cityCode;
      lat = saved.location.lat;
      lng = saved.location.lng;
    } else if (input.addressLine && input.cityCode && input.location) {
      // Ad-hoc address: the pin is the one the employer picked (validated
      // against Pakistan bounds by the schema) — never a default point.
      addressLine = input.addressLine;
      cityCode = input.cityCode;
      lat = input.location.lat;
      lng = input.location.lng;
    } else {
      throw new ValidationError([
        {
          path: 'companyLocationId',
          message: 'Choose a saved company location, or enter an address, city and map pin',
        },
      ]);
    }

    // Replace all locations with the one resolved above.
    await tx.delete(jl).where(eq(jl.jobId, jobId));
    await tx.execute(
      sql`INSERT INTO job_locations (id, job_id, company_location_id, address_line, city_code, location)
          VALUES (gen_random_uuid(), ${jobId}, ${input.companyLocationId ?? null},
                  ${addressLine}, ${cityCode},
                  ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))`,
    );
    audit({ action: 'job.set_location', entityType: 'job', entityId: jobId });
    return row;
  }).then((r) => buildJobView(db, r));
}

// ─── Sub-resource: requirements ─────────────────────────────────────────

export async function saveJobRequirements(
  ctx: SignedIn,
  jobId: string,
  input: JobRequirementsInput,
): Promise<JobView> {
  assertPermission(ctx.actor, 'job:manage_own');
  const company = await requireOwnCompany(db, ctx.actor);
  const row = await loadJob(db, jobId);
  if (row.companyId !== company.id) throw new NotFoundError('Job', jobId);
  // Audit 2026-11-11 (L-26): suspension freezes job edits.
  assertCompanyNotSuspended(company.status);
  // M29: requirements can only change while the job is editable.
  if (jobEditability(row.status) !== 'editable') {
    throw new ForbiddenError(
      'Job requirements can only be changed while in DRAFT, OPEN, or PAUSED status',
    );
  }
  // 2026-11-12: the company may edit all requirements of its own job in
  // any editable status — the old §3 staff-only rule for education,
  // experience and languages was lifted. The PUT replaces the row from
  // the body, as it already did for DRAFT jobs.
  return runCommand(ctx, async ({ tx, audit }) => {
    // H13: education level and language codes must be real, active
    // master-data codes.
    if (input.educationLevelCode) {
      await assertActiveMasterData(
        tx,
        'EDUCATION_LEVEL',
        [input.educationLevelCode],
        () => 'educationLevelCode',
      );
    }
    if (input.languageCodes?.length) {
      await assertActiveMasterData(
        tx,
        'LANGUAGE',
        input.languageCodes,
        (index) => `languageCodes[${index}]`,
      );
    }
    // The experience band is the source of truth: its minimum years are
    // derived so the matching engine (which reads years) keeps working,
    // and its minimum months make the 3–6 month band representable.
    const derivedYears =
      input.experienceLevel !== undefined
        ? experienceLevelToMinYears(input.experienceLevel)
        : (input.minExperienceYears ?? null);
    const values = {
      jobId,
      educationLevelCode: input.educationLevelCode ?? null,
      minExperienceYears: derivedYears,
      experienceLevel: input.experienceLevel ?? null,
      minExperienceMonths:
        input.minExperienceMonths ??
        (input.experienceLevel !== undefined
          ? EXPERIENCE_LEVEL_MIN_MONTHS[input.experienceLevel]
          : null),
      languageCodes: input.languageCodes ?? null,
      otherRequirements: input.otherRequirements ?? null,
    };
    await tx
      .insert(jr)
      .values(values)
      .onConflictDoUpdate({
        target: jr.jobId,
        set: {
          educationLevelCode: values.educationLevelCode,
          minExperienceYears: values.minExperienceYears,
          experienceLevel: values.experienceLevel,
          minExperienceMonths: values.minExperienceMonths,
          languageCodes: values.languageCodes,
          otherRequirements: values.otherRequirements,
          updatedAt: new Date(),
        },
      });
    audit({ action: 'job.save_requirements', entityType: 'job', entityId: jobId });
    return row;
  }).then((r) => buildJobView(db, r));
}

// ─── Sub-resource: skills ────────────────────────────────────────────────

export async function saveJobSkills(
  ctx: SignedIn,
  jobId: string,
  input: JobSkillsInput,
): Promise<JobView> {
  assertPermission(ctx.actor, 'job:manage_own');
  const company = await requireOwnCompany(db, ctx.actor);
  const row = await loadJob(db, jobId);
  if (row.companyId !== company.id) throw new NotFoundError('Job', jobId);
  // Audit 2026-11-11 (L-26): suspension freezes job edits.
  assertCompanyNotSuspended(company.status);
  // M29: skills can only change while the job is editable.
  if (jobEditability(row.status) !== 'editable') {
    throw new ForbiddenError(
      'Job skills can only be changed while in DRAFT, OPEN, or PAUSED status',
    );
  }
  // 2026-11-12: the company may change the skills of its own job in any
  // editable status — the old §3 staff-only skills rule was lifted.
  return runCommand(ctx, async ({ tx, audit }) => {
    // H13: skill codes must be real, active master-data codes. No
    // auto-upsert — round 1 removed it for applicants, stay consistent.
    if (input.skills.length > 0) {
      await assertActiveMasterData(
        tx,
        'SKILL',
        input.skills.map((s) => s.skillCode),
        (index) => `skills[${index}].skillCode`,
      );
    }
    await tx.delete(js).where(eq(js.jobId, jobId));
    if (input.skills.length > 0) {
      await tx.insert(js).values(
        input.skills.map((s) => ({
          jobId,
          skillCode: s.skillCode,
          required: s.required ?? true,
          minLevel: s.minLevel ?? 'BEGINNER',
        })),
      );
    }
    audit({ action: 'job.save_skills', entityType: 'job', entityId: jobId });
    return row;
  }).then((r) => buildJobView(db, r));
}
