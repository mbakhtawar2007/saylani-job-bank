import { z } from 'zod';
import { JOB_TYPES, SKILL_LEVELS, pakistanPointSchema } from './applicant';

// ─── Job status ─────────────────────────────────────────────────────────

export const JOB_STATUSES = ['DRAFT', 'OPEN', 'PAUSED', 'FILLED', 'CLOSED', 'EXPIRED'] as const;

// ─── Benefits enums ─────────────────────────────────────────────────────

export const MEDICAL_COVERAGE_TYPES = ['NONE', 'BASIC', 'COMPREHENSIVE'] as const;
export type MedicalCoverageType = (typeof MEDICAL_COVERAGE_TYPES)[number];
export const MEDICAL_COVERAGE_LABELS: Record<MedicalCoverageType, string> = {
  NONE: 'None',
  BASIC: 'Basic',
  COMPREHENSIVE: 'Comprehensive',
};

export const BONUS_TIERS = ['NONE', 'TIER_1', 'TIER_2', 'TIER_3'] as const;
export type BonusTier = (typeof BONUS_TIERS)[number];
export const BONUS_TIER_LABELS: Record<BonusTier, string> = {
  NONE: 'None',
  TIER_1: '1× monthly salary / year',
  TIER_2: '2× monthly salary / year',
  TIER_3: '3× monthly salary / year',
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
  shift: z.enum(SHIFT_TYPES),
  genderPreference: z.enum(GENDER_PREFERENCES),
  vacancies: z.number().int().min(1).max(9999),
  // M16: same 10,000,000 cap as applicant minSalaryPkr — a larger value
  // would overflow the Postgres integer column. The cross-field
  // salaryMin <= salaryMax check lives on the create schema below and, for
  // PATCH, on the merged (stored + incoming) values in updateJob.
  salaryMin: z.number().int().min(0).max(10_000_000).optional(),
  salaryMax: z.number().int().min(0).max(10_000_000).optional(),
  closesAt: z.string().datetime().optional(),
  // Benefits & Perks
  fuelAllowance: z.boolean(),
  flexibleHours: z.boolean(),
  annualLeaveDays: z.number().int().min(0).max(365).optional(),
  medicalCoverage: z.enum(MEDICAL_COVERAGE_TYPES),
  bonusTier: z.enum(BONUS_TIERS),
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

export const jobRequirementsSchema = z.object({
  educationLevelCode: z.string().trim().max(50).optional(),
  minExperienceYears: z.number().int().min(0).max(50).optional(),
  languageCodes: z.array(z.string().trim().min(1)).max(10).optional(),
  otherRequirements: z.string().trim().max(1000).optional(),
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
