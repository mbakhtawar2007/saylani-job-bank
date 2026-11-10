import { z } from 'zod';
import { JOB_TYPES, SKILL_LEVELS, pakistanPointSchema } from './applicant';

// ─── Job status ─────────────────────────────────────────────────────────

export const JOB_STATUSES = ['DRAFT', 'OPEN', 'PAUSED', 'FILLED', 'CLOSED', 'EXPIRED'] as const;

// ─── Benefits enums ─────────────────────────────────────────────────────

/** Minimum monthly salary (PKR) for any posted job — user decision 2026-11-10. */
export const MIN_SALARY_PKR = 41_700;

export const MEDICAL_COVERAGE_TYPES = ['NONE', 'BASIC', 'COMPREHENSIVE'] as const;
export type MedicalCoverageType = (typeof MEDICAL_COVERAGE_TYPES)[number];
export const MEDICAL_COVERAGE_LABELS: Record<MedicalCoverageType, string> = {
  NONE: 'None',
  BASIC: 'Basic',
  COMPREHENSIVE: 'Comprehensive',
};

/** Who the medical cover extends to (job posting form, 2026-11-10). */
export const MEDICAL_COVERAGE_SCOPES = ['INDIVIDUAL', 'FAMILY'] as const;
export type MedicalCoverageScope = (typeof MEDICAL_COVERAGE_SCOPES)[number];
export const MEDICAL_COVERAGE_SCOPE_LABELS: Record<MedicalCoverageScope, string> = {
  INDIVIDUAL: 'Individual',
  FAMILY: 'Family',
};

/**
 * Legacy single-select cover, kept for stored rows and detail pages. New
 * posts collect OPD / IPD limits + scope instead; the legacy value is
 * derived from them (both limits → COMPREHENSIVE, one → BASIC, none → NONE).
 */
export function deriveMedicalCoverage(
  opdLimit: number | null | undefined,
  ipdLimit: number | null | undefined,
): MedicalCoverageType {
  if (opdLimit != null && ipdLimit != null) return 'COMPREHENSIVE';
  if (opdLimit != null || ipdLimit != null) return 'BASIC';
  return 'NONE';
}

export const BONUS_TIERS = ['NONE', 'TIER_1', 'TIER_2', 'TIER_3'] as const;
export type BonusTier = (typeof BONUS_TIERS)[number];
export const BONUS_TIER_LABELS: Record<BonusTier, string> = {
  NONE: 'None',
  TIER_1: '1× monthly salary / year',
  TIER_2: '2× monthly salary / year',
  TIER_3: '3× monthly salary / year',
};

/**
 * Bonus basis (job posting form, 2026-11-10): the tier multiple is applied
 * to the gross salary or to the basic salary.
 */
export const BONUS_BASES = ['GROSS', 'BASIC'] as const;
export type BonusBasis = (typeof BONUS_BASES)[number];
export const BONUS_BASIS_LABELS: Record<BonusBasis, string> = {
  GROSS: 'Gross salary',
  BASIC: 'Basic salary',
};

/** The four bonus fields on the job posting form (2026-11-10): tier, basis, amount, frequency. */
export const BONUS_FREQUENCIES = ['ANNUAL', 'HALF_YEARLY', 'QUARTERLY'] as const;
export type BonusFrequency = (typeof BONUS_FREQUENCIES)[number];
export const BONUS_FREQUENCY_LABELS: Record<BonusFrequency, string> = {
  ANNUAL: 'Once a year',
  HALF_YEARLY: 'Twice a year',
  QUARTERLY: 'Every quarter',
};

export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  DRAFT: 'Draft',
  OPEN: 'Open',
  PAUSED: 'Paused',
  FILLED: 'Filled',
  CLOSED: 'Closed',
  EXPIRED: 'Expired',
};

export const OPEN_JOB_STATUSES = ['OPEN'] as const satisfies readonly JobStatus[];

// ─── Job type / shift ───────────────────────────────────────────────────

// JOB_TYPES / JobType / JOB_TYPE_LABELS already exported from applicant.ts

export const SHIFT_TYPES = ['DAY', 'NIGHT', 'ROTATING', 'FLEXIBLE'] as const;
export type ShiftType = (typeof SHIFT_TYPES)[number];
export const SHIFT_TYPE_LABELS: Record<ShiftType, string> = {
  DAY: 'Day shift',
  NIGHT: 'Night shift',
  ROTATING: 'Rotating',
  FLEXIBLE: 'Flexible',
};

/**
 * Shifts a new job posting may use (user decision 2026-11-10): rotation
 * only. SHIFT_TYPES stays the stored enum — older jobs keep their DAY /
 * NIGHT / FLEXIBLE shift — but the posting forms and the create/update
 * schemas only accept ROTATING.
 */
export const JOB_POSTING_SHIFT_TYPES = ['ROTATING'] as const;
export type JobPostingShiftType = (typeof JOB_POSTING_SHIFT_TYPES)[number];

// ─── Experience levels ──────────────────────────────────────────────────

/**
 * Experience bands for a job posting (user decision 2026-11-10). Months
 * are the source of truth — the 3–6 month Beginner band cannot be
 * expressed in whole years — and minExperienceYears is derived from the
 * band so the matching engine (which reads years) keeps working.
 */
export const EXPERIENCE_LEVELS = ['FRESHER', 'BEGINNER', 'INTERMEDIATE', 'EXPERT'] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];
export const EXPERIENCE_LEVEL_LABELS: Record<ExperienceLevel, string> = {
  FRESHER: 'Fresher (no experience)',
  BEGINNER: 'Beginner (3–6 months)',
  INTERMEDIATE: 'Intermediate (1–3 years)',
  EXPERT: 'Expert (3+ years)',
};
export const EXPERIENCE_LEVEL_MIN_MONTHS: Record<ExperienceLevel, number> = {
  FRESHER: 0,
  BEGINNER: 3,
  INTERMEDIATE: 12,
  EXPERT: 36,
};
export const EXPERIENCE_LEVEL_MAX_MONTHS: Record<ExperienceLevel, number> = {
  FRESHER: 0,
  BEGINNER: 6,
  INTERMEDIATE: 36,
  EXPERT: 600,
};

/** Whole years the matching engine should require for a band. */
export function experienceLevelToMinYears(level: ExperienceLevel): number {
  return Math.floor(EXPERIENCE_LEVEL_MIN_MONTHS[level] / 12);
}

/** Best-fit band for a stored minimum-experience value (edit-form initial state). */
export function experienceLevelForMonths(months: number | null | undefined): ExperienceLevel {
  if (months == null) return 'FRESHER';
  if (months <= 0) return 'FRESHER';
  if (months < 12) return 'BEGINNER';
  if (months < 36) return 'INTERMEDIATE';
  return 'EXPERT';
}

/** Languages a job may require (user decision 2026-11-10): English + Urdu only. */
export const JOB_LANGUAGE_CODES = ['URDU', 'ENGLISH'] as const;

/** Standard leave entitlement (days / year) — user-confirmed 2026-11-10. */
export const STANDARD_LEAVE_DAYS = { annual: 14, sick: 10, casual: 10 } as const;

export const GENDER_PREFERENCES = ['ANY', 'MALE', 'FEMALE'] as const;
export type GenderPreference = (typeof GENDER_PREFERENCES)[number];
export const GENDER_PREFERENCE_LABELS: Record<GenderPreference, string> = {
  ANY: 'Open to all',
  MALE: 'Male only',
  FEMALE: 'Female only',
};

// SKILL_LEVELS / SkillLevel / SKILL_LEVEL_LABELS already exported from applicant.ts

// ─── Schemas ────────────────────────────────────────────────────────────

// Field shapes without defaults. The create schema adds defaults on top;
// the update schema is built from these directly, so a partial PATCH never
// silently resets a field the caller did not touch (zod defaults survive
// .partial(), which used to wipe gender preference and every benefit).
const jobFieldSchema = {
  title: z.string().trim().min(3).max(200),
  categoryCode: z.string().trim().min(1).max(50),
  description: z.string().trim().min(10).max(5000),
  jobType: z.enum(JOB_TYPES),
  // Rotation only for new postings (see JOB_POSTING_SHIFT_TYPES).
  shift: z.enum(JOB_POSTING_SHIFT_TYPES),
  /** Hours per shift / day — asked right after the shift (2026-11-10). */
  shiftHours: z.number().int().min(1).max(24).optional(),
  /**
   * Designation the salary must correspond to (2026-11-10). A code from
   * the DESIGNATION master-data list when one exists; free text until the
   * user supplies that list. The salary-range check runs server-side
   * against the designation's master-data meta, when a range is stored.
   */
  designationCode: z.string().trim().min(1).max(50).optional(),
  genderPreference: z.enum(GENDER_PREFERENCES),
  vacancies: z.number().int().min(1).max(9999),
  // M16: same 10,000,000 cap as applicant minSalaryPkr — a larger value
  // would overflow the Postgres integer column. The cross-field
  // salaryMin <= salaryMax check lives on the create schema below and, for
  // PATCH, on the merged (stored + incoming) values in updateJob.
  // Floor: no posted salary may be below the PKR 41,700 minimum (2026-11-10).
  salaryMin: z.number().int().min(MIN_SALARY_PKR).max(10_000_000).optional(),
  salaryMax: z.number().int().min(MIN_SALARY_PKR).max(10_000_000).optional(),
  closesAt: z.string().datetime().optional(),
  // Benefits & Perks
  fuelAllowance: z.boolean(),
  flexibleHours: z.boolean(),
  // Standard entitlement is Annual 14 / Sick 10 / Casual 10 (2026-11-10):
  // defaults on create, editable per job — not a hard enforcement.
  annualLeaveDays: z.number().int().min(0).max(365).optional(),
  sickLeaveDays: z.number().int().min(0).max(365).optional(),
  casualLeaveDays: z.number().int().min(0).max(365).optional(),
  medicalCoverage: z.enum(MEDICAL_COVERAGE_TYPES),
  /** OPD / IPD cover limits (PKR) + who is covered — replaces the single select in the form. */
  opdLimit: z.number().int().min(0).max(10_000_000).optional(),
  ipdLimit: z.number().int().min(0).max(10_000_000).optional(),
  medicalCoverageScope: z.enum(MEDICAL_COVERAGE_SCOPES).optional(),
  bonusTier: z.enum(BONUS_TIERS),
  /** Bonus basis, amount and frequency — the four bonus fields are tier, basis, amount, frequency. */
  bonusBasis: z.enum(BONUS_BASES).optional(),
  bonusAmountPkr: z.number().int().min(0).max(10_000_000).optional(),
  bonusFrequency: z.enum(BONUS_FREQUENCIES).optional(),
  workFromHome: z.boolean(),
  providentFund: z.boolean(),
  transportAllowance: z.boolean(),
  eobi: z.boolean(),
  lifeInsurance: z.boolean(),
};

export const createJobSchema = z
  .object({
    ...jobFieldSchema,
    genderPreference: z.enum(GENDER_PREFERENCES).default('ANY'),
    fuelAllowance: z.boolean().default(false),
    flexibleHours: z.boolean().default(false),
    annualLeaveDays: z.number().int().min(0).max(365).default(STANDARD_LEAVE_DAYS.annual),
    sickLeaveDays: z.number().int().min(0).max(365).default(STANDARD_LEAVE_DAYS.sick),
    casualLeaveDays: z.number().int().min(0).max(365).default(STANDARD_LEAVE_DAYS.casual),
    medicalCoverage: z.enum(MEDICAL_COVERAGE_TYPES).default('NONE'),
    bonusTier: z.enum(BONUS_TIERS).default('NONE'),
    workFromHome: z.boolean().default(false),
    providentFund: z.boolean().default(false),
    transportAllowance: z.boolean().default(false),
    eobi: z.boolean().default(false),
    lifeInsurance: z.boolean().default(false),
  })
  // C4: a job must not be created with an inverted salary range or a
  // closing date that is already past.
  .superRefine((v, ctx) => {
    if (v.salaryMin !== undefined && v.salaryMax !== undefined && v.salaryMin > v.salaryMax) {
      ctx.addIssue({
        code: 'custom',
        path: ['salaryMin'],
        message: 'Minimum salary must not be more than maximum salary',
      });
    }
    if (v.closesAt !== undefined && new Date(v.closesAt).getTime() <= Date.now()) {
      ctx.addIssue({
        code: 'custom',
        path: ['closesAt'],
        message: 'Closing date must be in the future',
      });
    }
    // Hours are asked only when the job type is rotating (2026-11-10).
    if (v.jobType === 'ROTATING' && v.shiftHours === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['shiftHours'],
        message: 'How many hours is the shift?',
      });
    }
    // A bonus tier without a basis (or a basis without a tier) is incomplete.
    if (v.bonusTier !== 'NONE' && v.bonusBasis === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['bonusBasis'],
        message: 'Choose whether the bonus is calculated on gross or basic salary',
      });
    }
    if (v.bonusTier === 'NONE' && v.bonusBasis !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['bonusTier'],
        message: 'Choose a bonus tier to use a bonus basis',
      });
    }
  });

export type CreateJobInput = z.infer<typeof createJobSchema>;

export const updateJobSchema = z.object(jobFieldSchema).partial();
export type UpdateJobInput = z.infer<typeof updateJobSchema>;

export const jobStatusSchema = z.object({
  status: z.enum(['OPEN', 'PAUSED', 'CLOSED']),
  note: z.string().trim().max(500).optional(),
});
export type JobStatusInput = z.infer<typeof jobStatusSchema>;

/**
 * C5: a location update must carry something to save — either a saved company
 * location, or a full ad-hoc address (address + city + pin). An empty body
 * used to delete the job's only location with a 200. The pin reuses
 * pakistanPointSchema (same bounds as applicant locations) instead of
 * defaulting to a Karachi-centre point the employer never chose.
 */
export const jobLocationSchema = z
  .object({
    companyLocationId: z.uuid().optional(),
    location: pakistanPointSchema.optional(),
    addressLine: z.string().trim().min(3).max(300).optional(),
    cityCode: z.string().trim().min(1).max(50).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.companyLocationId) return;
    if (v.addressLine && v.cityCode && v.location) return;
    ctx.addIssue({
      code: 'custom',
      path: ['companyLocationId'],
      message: 'Choose a saved company location, or enter an address, city and map pin',
    });
  });
export type JobLocationInput = z.infer<typeof jobLocationSchema>;

export const jobRequirementsSchema = z
  .object({
    educationLevelCode: z.string().trim().max(50).optional(),
    /** Kept for matching + stored rows; derived from experienceLevel when a level is sent. */
    minExperienceYears: z.number().int().min(0).max(50).optional(),
    /** Experience band (2026-11-10) + its minimum in months, so 3–6 months is representable. */
    experienceLevel: z.enum(EXPERIENCE_LEVELS).optional(),
    minExperienceMonths: z.number().int().min(0).max(600).optional(),
    /** A job may only require English and Urdu (2026-11-10). */
    languageCodes: z.array(z.enum(JOB_LANGUAGE_CODES)).max(2).optional(),
    otherRequirements: z.string().trim().max(1000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.experienceLevel !== undefined && v.minExperienceMonths !== undefined) {
      const min = EXPERIENCE_LEVEL_MIN_MONTHS[v.experienceLevel];
      const max = EXPERIENCE_LEVEL_MAX_MONTHS[v.experienceLevel];
      if (v.minExperienceMonths < min || v.minExperienceMonths > max) {
        ctx.addIssue({
          code: 'custom',
          path: ['minExperienceMonths'],
          message:
            max === 600
              ? `${EXPERIENCE_LEVEL_LABELS[v.experienceLevel]} needs at least ${min} months`
              : `${EXPERIENCE_LEVEL_LABELS[v.experienceLevel]} needs ${min}–${max} months`,
        });
      }
    }
  });
export type JobRequirementsInput = z.infer<typeof jobRequirementsSchema>;

export const jobSkillSchema = z.object({
  skillCode: z.string().trim().min(1).max(50),
  required: z.boolean().default(true),
  minLevel: z.enum(SKILL_LEVELS).default('BEGINNER'),
});
export const jobSkillsSchema = z.object({
  // L15: same duplicate-skillCode refine as applicant skillsSchema.
  skills: z
    .array(jobSkillSchema)
    .max(20)
    .refine((skills) => new Set(skills.map((s) => s.skillCode)).size === skills.length, {
      message: 'Each skill only once',
    }),
});
export type JobSkillInput = z.infer<typeof jobSkillSchema>;
export type JobSkillsInput = z.infer<typeof jobSkillsSchema>;
