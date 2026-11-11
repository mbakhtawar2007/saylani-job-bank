import {
  deriveMedicalCoverage,
  type JobRequirementsInput,
  type JobStatus,
  type MedicalCoverageType,
  type Role,
  type UpdateJobInput,
} from '@jobbank/shared';
import { isCheckViolation, ValidationError } from '@/domains/shared/errors';
import { assertActiveMasterData, findMasterDataByCodes } from '@/domains/settings';
import type { DbExecutor } from '@/lib/db';

export type JobEditability = 'editable' | 'read_only';

export function jobEditability(status: JobStatus): JobEditability {
  return status === 'DRAFT' || status === 'OPEN' || status === 'PAUSED' ? 'editable' : 'read_only';
}

// ─── Employer field restrictions (referral workflow §3) ─────────────────
// While DRAFT an employer may edit everything. Once the job is published
// (OPEN — and PAUSED, which was published and already matched) the employer
// may edit only the fields below; the rest are staff / admin only, because
// they drive matching, city scope, pay and headcount. The company itself is
// never editable through the job endpoints: updateJobSchema has no
// companyId field (zod strips it) and updateJob never writes it.

/** UpdateJobInput keys an employer may still edit once the job is OPEN. */
export const EMPLOYER_OPEN_JOB_FIELDS = [
  'description',
  // Benefits & perks — all except medical coverage and bonus tier, which
  // the spec lists as restricted (they are part of the pay package).
  'fuelAllowance',
  'flexibleHours',
  'annualLeaveDays',
  'sickLeaveDays',
  'casualLeaveDays',
  'workFromHome',
  'providentFund',
  'transportAllowance',
  'eobi',
  'lifeInsurance',
] as const satisfies readonly (keyof UpdateJobInput)[];

/** UpdateJobInput keys restricted once the job is OPEN (staff / admin only). */
export const EMPLOYER_RESTRICTED_JOB_FIELDS = [
  'title',
  'categoryCode',
  'jobType',
  'shift',
  'shiftHours',
  'designationCode',
  'genderPreference',
  'vacancies',
  'salaryMin',
  'salaryMax',
  'closesAt',
  'medicalCoverage',
  'opdLimit',
  'ipdLimit',
  'medicalCoverageScope',
  'bonusTier',
  'bonusBasis',
  'bonusAmountPkr',
  'bonusFrequency',
] as const satisfies readonly (keyof UpdateJobInput)[];

/** JobRequirementsInput keys an employer may still edit once the job is OPEN. */
export const EMPLOYER_OPEN_REQUIREMENTS_FIELDS = [
  'otherRequirements',
] as const satisfies readonly (keyof JobRequirementsInput)[];

/**
 * JobRequirementsInput keys restricted once the job is OPEN. Education
 * level, minimum experience and languages drive matching just like skills
 * do, so they are staff-only alongside the skills list itself.
 */
export const EMPLOYER_RESTRICTED_REQUIREMENTS_FIELDS = [
  'educationLevelCode',
  'minExperienceYears',
  'experienceLevel',
  'minExperienceMonths',
  'languageCodes',
] as const satisfies readonly (keyof JobRequirementsInput)[];

/** True for a published job (OPEN, or PAUSED after having been published). */
export function isEmployerRestrictedJobStatus(status: JobStatus): boolean {
  return status === 'OPEN' || status === 'PAUSED';
}

/**
 * Roles that bypass the employer field restrictions on a published job
 * (N20 decision, 2026-11-08). The bypass used to be permission-based
 * (`hasPermission(actor, 'job:manage')`), which wrongly INCLUDED verifiers
 * — VERIFIER holds `job:manage` for posting jobs via staffCreateJob — and
 * wrongly EXCLUDED Super Admin, who holds neither `job:manage` nor
 * `job:manage_own` and was therefore treated as an employer by the
 * allowlist. The bypass is now role-based: STAFF and BRANCH_ADMIN run the
 * Job Bank side of a posting, and SUPER_ADMIN is never treated as an
 * employer. VERIFIER is explicitly NOT in the bypass: verifier job-posting
 * is intended (7296e68), but the restricted-field bypass for verifiers was
 * never decided, so a verifier stays restricted here unless they also hold
 * STAFF, BRANCH_ADMIN or SUPER_ADMIN. SUPER_ADMIN gets this explicit
 * bypass instead of being granted `job:manage`: the repo's established
 * pattern is explicit SA bypasses (see scope.ts), SA deliberately holds no
 * operator permissions, and granting `job:manage` would also open
 * staffCreateJob and every other `job:manage`-gated staff path to SA.
 */
export const STAFF_JOB_BYPASS_ROLES: readonly Role[] = ['STAFF', 'BRANCH_ADMIN', 'SUPER_ADMIN'];

/** True when the actor's roles bypass the employer field restrictions. */
export function mayBypassEmployerJobRestrictions(roles: readonly Role[]): boolean {
  return roles.some((role) => STAFF_JOB_BYPASS_ROLES.includes(role));
}

/**
 * Restricted PATCH fields the input actually carries, for an employer
 * editing a job in the given status. Empty when the actor holds a bypass
 * role (STAFF, BRANCH_ADMIN or SUPER_ADMIN — see
 * mayBypassEmployerJobRestrictions) or the job is still DRAFT.
 * Pure and DB-free so the allowlist is unit-testable without a database.
 */
export function employerRestrictedUpdateFields(
  roles: readonly Role[],
  status: JobStatus,
  input: UpdateJobInput,
): (keyof UpdateJobInput)[] {
  if (mayBypassEmployerJobRestrictions(roles) || !isEmployerRestrictedJobStatus(status)) return [];
  return EMPLOYER_RESTRICTED_JOB_FIELDS.filter((field) => input[field] !== undefined);
}

/** Same allowlist for the requirements sub-resource (PUT replaces the row). */
export function employerRestrictedRequirementsFields(
  roles: readonly Role[],
  status: JobStatus,
  input: JobRequirementsInput,
): (keyof JobRequirementsInput)[] {
  if (mayBypassEmployerJobRestrictions(roles) || !isEmployerRestrictedJobStatus(status)) return [];
  return EMPLOYER_RESTRICTED_REQUIREMENTS_FIELDS.filter((field) => input[field] !== undefined);
}

/**
 * Whether the actor may replace the job's location or skills list outright.
 * Both are restricted once the job is OPEN (location drives city scope,
 * skills drive matching); only bypass-role holders may change them then.
 */
export function employerMayEditJobSubResource(roles: readonly Role[], status: JobStatus): boolean {
  return mayBypassEmployerJobRestrictions(roles) || !isEmployerRestrictedJobStatus(status);
}

// ─── Shared update validation (audit 2026-11-11, M-25) ────────────────────
// The employer path (profile.ts updateJob) used to own the merged-value
// checks while the staff path (staff.ts staffUpdateJob) wrote input straight
// to the DB, so bad staff input surfaced as raw 500s from the check
// constraints. Both paths now call the helpers below.

export interface JobUpdateStoredValues {
  salaryMin: number | null;
  salaryMax: number | null;
  vacanciesFilled: number;
  opdLimit?: number | null;
  ipdLimit?: number | null;
}

/**
 * Pure merged-value checks: salaryMin <= salaryMax against the MERGED
 * (stored + incoming) values — updateJobSchema is a bare .partial(), so a
 * PATCH that only sets salaryMin above the stored salaryMax would otherwise
 * pass; a new closesAt must be in the future; vacancies cannot drop below
 * the filled count. Throws ValidationError.
 */
export function assertMergedJobUpdateValid(
  input: UpdateJobInput,
  row: JobUpdateStoredValues,
): void {
  const mergedMin = input.salaryMin ?? row.salaryMin ?? null;
  const mergedMax = input.salaryMax ?? row.salaryMax ?? null;
  const issues: { path: string; message: string }[] = [];
  if (mergedMin !== null && mergedMax !== null && mergedMin > mergedMax) {
    issues.push({
      path: 'salaryMin',
      message: 'Minimum salary must not be more than maximum salary',
    });
  }
  if (
    input.closesAt !== undefined &&
    input.closesAt !== null &&
    new Date(input.closesAt).getTime() <= Date.now()
  ) {
    issues.push({ path: 'closesAt', message: 'Closing date must be in the future' });
  }
  // Audit 2026-11-10 (C-F8): lowering vacancies below the filled count used
  // to hit the DB check constraint as an unhandled 500.
  if (input.vacancies !== undefined && input.vacancies < row.vacanciesFilled) {
    issues.push({
      path: 'vacancies',
      message: `Vacancies cannot be less than the ${row.vacanciesFilled} already filled`,
    });
  }
  if (issues.length > 0) throw new ValidationError(issues);
}

/**
 * Salary must correspond to the designation (2026-11-10): when the
 * designation exists in DESIGNATION master data with a salary range, the
 * job's salary must fall inside it. A designation code with no master-data
 * row (free text, until the user supplies the designation list) cannot be
 * range-checked, so it passes — the check is scaffolding, not a block.
 * (Moved here from profile.ts so the staff path can reuse it.)
 */
export async function assertDesignationSalaryRange(
  tx: DbExecutor,
  designationCode: string | null | undefined,
  salaryMin: number | null | undefined,
  salaryMax: number | null | undefined,
): Promise<void> {
  if (!designationCode) return;
  const [item] = await findMasterDataByCodes('DESIGNATION', [designationCode], tx);
  if (!item) return;
  const meta = (item.meta ?? {}) as { salaryMin?: unknown; salaryMax?: unknown };
  const rangeMin = typeof meta.salaryMin === 'number' ? meta.salaryMin : null;
  const rangeMax = typeof meta.salaryMax === 'number' ? meta.salaryMax : null;
  const issues: { path: string; message: string }[] = [];
  if (rangeMin !== null && salaryMin != null && salaryMin < rangeMin) {
    issues.push({
      path: 'salaryMin',
      message: `Minimum salary for ${item.label} is PKR ${rangeMin.toLocaleString('en-PK')}`,
    });
  }
  if (rangeMax !== null && salaryMax != null && salaryMax > rangeMax) {
    issues.push({
      path: 'salaryMax',
      message: `Maximum salary for ${item.label} is PKR ${rangeMax.toLocaleString('en-PK')}`,
    });
  }
  if (issues.length > 0) throw new ValidationError(issues);
}

/**
 * DB-backed reference checks for a job update: a changed category must be a
 * real, active master-data code; the salary must fit the (possibly changed)
 * designation's range, checked against the merged salary/designation.
 */
export async function assertJobUpdateReferencesValid(
  tx: DbExecutor,
  input: UpdateJobInput,
  row: JobUpdateStoredValues & { designationCode: string | null },
): Promise<void> {
  if (input.categoryCode !== undefined) {
    await assertActiveMasterData(tx, 'JOB_CATEGORY', [input.categoryCode], () => 'categoryCode');
  }
  if (
    input.designationCode !== undefined ||
    input.salaryMin !== undefined ||
    input.salaryMax !== undefined
  ) {
    const mergedMin = input.salaryMin ?? row.salaryMin ?? null;
    const mergedMax = input.salaryMax ?? row.salaryMax ?? null;
    await assertDesignationSalaryRange(
      tx,
      input.designationCode ?? row.designationCode,
      mergedMin,
      mergedMax,
    );
  }
}

/**
 * A changed OPD / IPD limit re-derives the legacy cover label from the
 * merged limits; returns undefined when neither limit changes.
 */
export function mergedMedicalCoverage(
  input: UpdateJobInput,
  row: JobUpdateStoredValues,
): MedicalCoverageType | undefined {
  if (input.opdLimit === undefined && input.ipdLimit === undefined) return undefined;
  return deriveMedicalCoverage(
    input.opdLimit ?? row.opdLimit ?? null,
    input.ipdLimit ?? row.ipdLimit ?? null,
  );
}

/** DB check constraints on jobs, mapped to the field they guard. */
const JOB_CHECK_VIOLATIONS: Record<string, { path: string; message: string }> = {
  jobs_salary_order: {
    path: 'salaryMin',
    message: 'Minimum salary must not be more than maximum salary',
  },
  jobs_salary_min_floor: { path: 'salaryMin', message: 'Minimum salary is PKR 41,700' },
  jobs_salary_max_floor: { path: 'salaryMax', message: 'Maximum salary is PKR 41,700' },
  jobs_shift_hours_range: {
    path: 'shiftHours',
    message: 'Shift hours must be between 1 and 24',
  },
  jobs_vacancies_positive: { path: 'vacancies', message: 'Vacancies must be at least 1' },
  jobs_filled_lte_vacancies: {
    path: 'vacancies',
    message: 'Vacancies cannot be less than the number already filled',
  },
};

/**
 * Maps a Postgres check-constraint failure on the jobs table to a
 * ValidationError on the guarding field (or null when it is not a known
 * jobs check violation). The pre-checks above make these unreachable in
 * practice except for a race — e.g. a vacancy filling between the check and
 * the write — which must still surface as a 422, not a 500.
 */
export function mapJobCheckViolation(error: unknown): ValidationError | null {
  for (const [constraint, issue] of Object.entries(JOB_CHECK_VIOLATIONS)) {
    if (isCheckViolation(error, constraint)) return new ValidationError([issue]);
  }
  return null;
}
