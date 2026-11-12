import {
  deriveMedicalCoverage,
  type CompanyStatus,
  type JobStatus,
  type MedicalCoverageType,
  type UpdateJobInput,
} from '@jobbank/shared';
import { ForbiddenError, isCheckViolation, ValidationError } from '@/domains/shared/errors';
import { assertActiveMasterData, findMasterDataByCodes } from '@/domains/settings';
import type { DbExecutor } from '@/lib/db';

export type JobEditability = 'editable' | 'read_only';

export function jobEditability(status: JobStatus): JobEditability {
  return status === 'DRAFT' || status === 'OPEN' || status === 'PAUSED' ? 'editable' : 'read_only';
}

/**
 * Audit 2026-11-11 (L-26): suspension freezes job edits. A SUSPENDED
 * company's jobs cannot be edited by anyone — employer or staff — until the
 * company is reinstated. Scoped to SUSPENDED only: DRAFT / INFO_REQUESTED /
 * REJECTED companies must still be able to edit draft jobs (normal
 * onboarding flow) and VERIFIED companies are unaffected.
 */
export function assertCompanyNotSuspended(status: CompanyStatus): void {
  if (status === 'SUSPENDED') {
    throw new ForbiddenError(
      'This company is suspended — its jobs cannot be edited while it is suspended',
    );
  }
}

// ─── Employer field restrictions — REMOVED 2026-11-12 ────────────────────
// The company (employer) may now fully edit its own jobs in any editable
// status (DRAFT, OPEN, PAUSED). The old referral-workflow §3 rule — OPEN
// jobs editable only in description / non-pay benefits, everything else
// staff-only — was lifted by user decision (handwritten note 2026-11-12:
// "Company can edit Job"), reversing the approved 2026-11-08 limited-edit
// rule. The only remaining gates on the employer path are jobEditability
// (DRAFT / OPEN / PAUSED) and the suspension freeze below. Consequence:
// edits to matching-driving fields (title, category, skills, education,
// experience, location, salary, vacancies, closesAt) on an OPEN job now
// apply immediately and can affect existing matches and referrals.
// The company itself is still never changeable via the job endpoints:
// updateJobSchema has no companyId field and updateJob never writes it.

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
