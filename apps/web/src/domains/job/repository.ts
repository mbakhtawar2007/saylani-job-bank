import 'server-only';
import { schema } from '@jobbank/db';
import type {
  BonusBasis,
  BonusFrequency,
  BonusTier,
  ExperienceLevel,
  GenderPreference,
  JobStatus,
  JobType,
  MedicalCoverageScope,
  MedicalCoverageType,
  ShiftType,
  SkillLevel,
} from '@jobbank/shared';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { NotFoundError } from '@/domains/shared/errors';
import { db, type DbExecutor } from '@/lib/db';

export const j = schema.jobs;
export const jl = schema.jobLocations;
export const jr = schema.jobRequirements;
export const js = schema.jobSkills;

export type JobRow = typeof j.$inferSelect;
export type JobLocationRow = typeof jl.$inferSelect;
export type JobRequirementsRow = typeof jr.$inferSelect;
export type JobSkillRow = typeof js.$inferSelect;

// ─── Views ──────────────────────────────────────────────────────────────

export interface JobLocationView {
  id: string;
  companyLocationId: string | null;
  addressLine: string;
  cityCode: string;
  /** Work pin on the map (public job-site coordinates, not private data). */
  location: { lat: number; lng: number } | null;
}

export interface JobRequirementsView {
  educationLevelCode: string | null;
  minExperienceYears: number | null;
  experienceLevel: ExperienceLevel | null;
  minExperienceMonths: number | null;
  languageCodes: string[];
  otherRequirements: string | null;
}

export interface JobSkillView {
  skillCode: string;
  required: boolean;
  minLevel: SkillLevel;
}

export interface JobView {
  id: string;
  companyId: string;
  branchId: string;
  title: string;
  categoryCode: string;
  description: string;
  jobType: JobType;
  shift: ShiftType;
  shiftHours: number | null;
  designationCode: string | null;
  genderPreference: GenderPreference;
  vacancies: number;
  vacanciesFilled: number;
  salaryMin: number | null;
  salaryMax: number | null;
  status: JobStatus;
  closesAt: string | null;
  publishedAt: string | null;
  closedAt: string | null;
  reopenedAt: string | null;
  // Benefits & Perks
  fuelAllowance: boolean;
  flexibleHours: boolean;
  annualLeaveDays: number | null;
  sickLeaveDays: number | null;
  casualLeaveDays: number | null;
  medicalCoverage: MedicalCoverageType;
  opdLimit: number | null;
  ipdLimit: number | null;
  medicalCoverageScope: MedicalCoverageScope | null;
  bonusTier: BonusTier;
  bonusBasis: BonusBasis | null;
  bonusAmountPkr: number | null;
  bonusFrequency: BonusFrequency | null;
  workFromHome: boolean;
  providentFund: boolean;
  transportAllowance: boolean;
  eobi: boolean;
  lifeInsurance: boolean;
  locations: JobLocationView[];
  requirements: JobRequirementsView | null;
  skills: JobSkillView[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Loading ────────────────────────────────────────────────────────────

export async function loadJob(
  executor: DbExecutor,
  jobId: string,
  options: { forUpdate?: boolean } = {},
): Promise<JobRow> {
  const query = executor.select().from(j).where(eq(j.id, jobId));
  const [row] = options.forUpdate ? await query.for('update') : await query;
  if (!row) throw new NotFoundError('Job', jobId);
  return row;
}

/**
 * Pure assembly of a JobView from a job row plus its already-loaded child
 * rows (locations in createdAt order, at most one requirements row, skills
 * in skillCode order). Shared by the single- and batch loaders so both
 * return identical views.
 */
function toJobView(
  row: JobRow,
  locations: JobLocationRow[],
  reqs: JobRequirementsRow | undefined,
  skills: JobSkillRow[],
): JobView {
  return {
    id: row.id,
    companyId: row.companyId,
    branchId: row.branchId,
    title: row.title,
    categoryCode: row.categoryCode,
    description: row.description,
    jobType: row.jobType as JobType,
    shift: row.shift as ShiftType,
    shiftHours: row.shiftHours,
    designationCode: row.designationCode,
    genderPreference: row.genderPreference as GenderPreference,
    vacancies: row.vacancies,
    vacanciesFilled: row.vacanciesFilled,
    salaryMin: row.salaryMin,
    salaryMax: row.salaryMax,
    status: row.status as JobStatus,
    closesAt: row.closesAt?.toISOString() ?? null,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    reopenedAt: row.reopenedAt?.toISOString() ?? null,
    fuelAllowance: row.fuelAllowance,
    flexibleHours: row.flexibleHours,
    annualLeaveDays: row.annualLeaveDays,
    sickLeaveDays: row.sickLeaveDays,
    casualLeaveDays: row.casualLeaveDays,
    medicalCoverage: row.medicalCoverage as MedicalCoverageType,
    opdLimit: row.opdLimit,
    ipdLimit: row.ipdLimit,
    medicalCoverageScope: row.medicalCoverageScope as MedicalCoverageScope | null,
    bonusTier: row.bonusTier as BonusTier,
    bonusBasis: row.bonusBasis as BonusBasis | null,
    bonusAmountPkr: row.bonusAmountPkr,
    bonusFrequency: row.bonusFrequency as BonusFrequency | null,
    workFromHome: row.workFromHome,
    providentFund: row.providentFund,
    transportAllowance: row.transportAllowance,
    eobi: row.eobi,
    lifeInsurance: row.lifeInsurance,
    locations: locations.map((l) => ({
      id: l.id,
      companyLocationId: l.companyLocationId,
      addressLine: l.addressLine,
      cityCode: l.cityCode,
      location: l.location,
    })),
    requirements: reqs
      ? {
          educationLevelCode: reqs.educationLevelCode,
          minExperienceYears: reqs.minExperienceYears,
          experienceLevel: reqs.experienceLevel as ExperienceLevel | null,
          minExperienceMonths: reqs.minExperienceMonths,
          languageCodes: reqs.languageCodes ?? [],
          otherRequirements: reqs.otherRequirements,
        }
      : null,
    skills: skills.map((s) => ({
      skillCode: s.skillCode,
      required: s.required,
      minLevel: s.minLevel as SkillLevel,
    })),
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function buildJobView(executor: DbExecutor, row: JobRow): Promise<JobView> {
  const [locations, [reqs], skills] = await Promise.all([
    executor.select().from(jl).where(eq(jl.jobId, row.id)).orderBy(asc(jl.createdAt)),
    executor.select().from(jr).where(eq(jr.jobId, row.id)),
    executor.select().from(js).where(eq(js.jobId, row.id)).orderBy(asc(js.skillCode)),
  ]);
  return toJobView(row, locations, reqs, skills);
}

/**
 * Batch loader: the same three child-table queries for ANY number of jobs
 * (3 queries total, not 3 per job). `listJobsForEmployer` and the staff job
 * lists map one row per job through `buildJobView` today, so N jobs cost
 * 3N queries; callers that switch to this keep the identical views. Rows
 * come back in the input order.
 */
export async function buildJobViews(executor: DbExecutor, rows: JobRow[]): Promise<JobView[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [locations, reqs, skills] = await Promise.all([
    executor.select().from(jl).where(inArray(jl.jobId, ids)).orderBy(asc(jl.createdAt)),
    executor.select().from(jr).where(inArray(jr.jobId, ids)),
    executor.select().from(js).where(inArray(js.jobId, ids)).orderBy(asc(js.skillCode)),
  ]);
  const byJob = <T extends { jobId: string }>(list: T[]): Map<string, T[]> => {
    const map = new Map<string, T[]>();
    for (const item of list) {
      const bucket = map.get(item.jobId);
      if (bucket) bucket.push(item);
      else map.set(item.jobId, [item]);
    }
    return map;
  };
  const locationsByJob = byJob(locations);
  const reqsByJob = byJob(reqs);
  const skillsByJob = byJob(skills);
  return rows.map((row) =>
    toJobView(
      row,
      locationsByJob.get(row.id) ?? [],
      reqsByJob.get(row.id)?.[0],
      skillsByJob.get(row.id) ?? [],
    ),
  );
}

export async function getJob(jobId: string): Promise<JobView> {
  const row = await loadJob(db, jobId);
  return buildJobView(db, row);
}

export async function jobsByCompany(executor: DbExecutor, companyId: string): Promise<JobRow[]> {
  return executor.select().from(j).where(eq(j.companyId, companyId)).orderBy(desc(j.createdAt));
}
