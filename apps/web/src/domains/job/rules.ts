import type { JobRequirementsInput, JobStatus, Role, UpdateJobInput } from '@jobbank/shared';

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
