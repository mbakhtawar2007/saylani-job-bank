import type { JobRequirementsInput, JobStatus, UpdateJobInput } from '@jobbank/shared';

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
  'genderPreference',
  'vacancies',
  'salaryMin',
  'salaryMax',
  'closesAt',
  'medicalCoverage',
  'bonusTier',
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
  'languageCodes',
] as const satisfies readonly (keyof JobRequirementsInput)[];

/** True for a published job (OPEN, or PAUSED after having been published). */
export function isEmployerRestrictedJobStatus(status: JobStatus): boolean {
  return status === 'OPEN' || status === 'PAUSED';
}

/**
 * Restricted PATCH fields the input actually carries, for an employer
 * editing a job in the given status. Empty when the actor is staff
 * (`job:manage` holders edit everything) or the job is still DRAFT.
 * Pure and DB-free so the allowlist is unit-testable without a database.
 */
export function employerRestrictedUpdateFields(
  isStaff: boolean,
  status: JobStatus,
  input: UpdateJobInput,
): (keyof UpdateJobInput)[] {
  if (isStaff || !isEmployerRestrictedJobStatus(status)) return [];
  return EMPLOYER_RESTRICTED_JOB_FIELDS.filter((field) => input[field] !== undefined);
}

/** Same allowlist for the requirements sub-resource (PUT replaces the row). */
export function employerRestrictedRequirementsFields(
  isStaff: boolean,
  status: JobStatus,
  input: JobRequirementsInput,
): (keyof JobRequirementsInput)[] {
  if (isStaff || !isEmployerRestrictedJobStatus(status)) return [];
  return EMPLOYER_RESTRICTED_REQUIREMENTS_FIELDS.filter((field) => input[field] !== undefined);
}

/**
 * Whether the actor may replace the job's location or skills list outright.
 * Both are restricted once the job is OPEN (location drives city scope,
 * skills drive matching); only staff may change them then.
 */
export function employerMayEditJobSubResource(isStaff: boolean, status: JobStatus): boolean {
  return isStaff || !isEmployerRestrictedJobStatus(status);
}

/** Transitions the employer is allowed to trigger. */
export type JobStatusTransition = 'publish' | 'pause' | 'resume' | 'close' | 'reopen';

export function allowedTransitions(status: JobStatus): JobStatusTransition[] {
  switch (status) {
    case 'DRAFT':
      return ['publish'];
    case 'OPEN':
      return ['pause', 'close'];
    case 'PAUSED':
      return ['resume', 'close'];
    case 'CLOSED':
      return ['reopen'];
    case 'FILLED':
    case 'EXPIRED':
      return [];
  }
}
