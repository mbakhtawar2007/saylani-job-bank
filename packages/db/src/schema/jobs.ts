import {
  BONUS_BASES,
  BONUS_FREQUENCIES,
  BONUS_TIERS,
  EXPERIENCE_LEVELS,
  GENDER_PREFERENCES,
  JOB_STATUSES,
  JOB_TYPES,
  MEDICAL_COVERAGE_SCOPES,
  MEDICAL_COVERAGE_TYPES,
  SHIFT_TYPES,
  SKILL_LEVELS,
} from '@jobbank/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { geographyPoint } from '../types/geography';

// ─── jobs ──────────────────────────────────────────────────────────────

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull(),
    branchId: uuid('branch_id').notNull(),
    title: text('title').notNull(),
    categoryCode: text('category_code').notNull(),
    description: text('description').notNull(),
    jobType: text('job_type', { enum: JOB_TYPES }).notNull(),
    shift: text('shift', { enum: SHIFT_TYPES }).notNull(),
    /** Hours per shift/day — rotation-only postings (2026-11-10). */
    shiftHours: smallint('shift_hours'),
    /** Designation the salary must correspond to (2026-11-10). */
    designationCode: text('designation_code'),
    genderPreference: text('gender_preference', { enum: GENDER_PREFERENCES })
      .notNull()
      .default('ANY'),
    vacancies: smallint('vacancies').notNull(),
    vacanciesFilled: smallint('vacancies_filled').notNull().default(0),
    salaryMin: integer('salary_min'),
    salaryMax: integer('salary_max'),
    status: text('status', { enum: JOB_STATUSES }).notNull().default('DRAFT'),
    closesAt: timestamp('closes_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    reopenedAt: timestamp('reopened_at', { withTimezone: true }),
    // Benefits & Perks
    fuelAllowance: boolean('fuel_allowance').notNull().default(false),
    flexibleHours: boolean('flexible_hours').notNull().default(false),
    annualLeaveDays: smallint('annual_leave_days'),
    sickLeaveDays: smallint('sick_leave_days'),
    casualLeaveDays: smallint('casual_leave_days'),
    medicalCoverage: text('medical_coverage', { enum: MEDICAL_COVERAGE_TYPES })
      .notNull()
      .default('NONE'),
    /** Structured medical cover (2026-11-10); medicalCoverage is derived from these. */
    opdLimit: integer('opd_limit'),
    ipdLimit: integer('ipd_limit'),
    medicalCoverageScope: text('medical_coverage_scope', { enum: MEDICAL_COVERAGE_SCOPES }),
    bonusTier: text('bonus_tier', { enum: BONUS_TIERS }).notNull().default('NONE'),
    /** Bonus basis / amount / frequency — the four bonus fields are tier, basis, amount, frequency. */
    bonusBasis: text('bonus_basis', { enum: BONUS_BASES }),
    bonusAmountPkr: integer('bonus_amount_pkr'),
    bonusFrequency: text('bonus_frequency', { enum: BONUS_FREQUENCIES }),
    workFromHome: boolean('work_from_home').notNull().default(false),
    providentFund: boolean('provident_fund').notNull().default(false),
    transportAllowance: boolean('transport_allowance').notNull().default(false),
    eobi: boolean('eobi').notNull().default(false),
    lifeInsurance: boolean('life_insurance').notNull().default(false),
    createdBy: uuid('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('jobs_company_idx').on(t.companyId),
    index('jobs_branch_status_idx').on(t.branchId, t.status),
    index('jobs_category_idx').on(t.categoryCode),
    // Trigram index for the staff `ILIKE '%q%'` title search (job/staff.ts).
    // categoryCode is searched too but already has a btree index and is a
    // short code, not free text — no trigram index there.
    // GIN has no default opclass for text — `gin_trgm_ops` must be named
    // explicitly or CREATE INDEX fails with 42704 (migration 0027).
    index('jobs_title_trgm_idx').using('gin', sql`${t.title} gin_trgm_ops`),
    check(
      'jobs_salary_order',
      sql`salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max`,
    ),
    // Minimum salary PKR 41,700 (2026-11-10) — enforced in the DB as well as the schema.
    check('jobs_salary_min_floor', sql`salary_min IS NULL OR salary_min >= 41700`),
    check('jobs_salary_max_floor', sql`salary_max IS NULL OR salary_max >= 41700`),
    check(
      'jobs_shift_hours_range',
      sql`shift_hours IS NULL OR (shift_hours >= 1 AND shift_hours <= 24)`,
    ),
    check('jobs_vacancies_positive', sql`vacancies > 0`),
    check('jobs_filled_lte_vacancies', sql`vacancies_filled <= vacancies`),
  ],
);

// ─── job_locations ─────────────────────────────────────────────────────

export const jobLocations = pgTable(
  'job_locations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id').notNull(),
    /** Optionally linked to a company location. */
    companyLocationId: uuid('company_location_id'),
    addressLine: text('address_line').notNull(),
    cityCode: text('city_code').notNull(),
    location: geographyPoint('location').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('job_locations_job_idx').on(t.jobId),
    index('job_locations_gist_idx').using('gist', t.location),
  ],
);

// ─── job_requirements ──────────────────────────────────────────────────

export const jobRequirements = pgTable('job_requirements', {
  jobId: uuid('job_id').primaryKey(),
  educationLevelCode: text('education_level_code'),
  minExperienceYears: smallint('min_experience_years'),
  /** Experience band + minimum months (2026-11-10); years are derived from the band. */
  experienceLevel: text('experience_level', { enum: EXPERIENCE_LEVELS }),
  minExperienceMonths: smallint('min_experience_months'),
  languageCodes: text('language_codes').array(),
  otherRequirements: text('other_requirements'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── job_skills ────────────────────────────────────────────────────────

export const jobSkills = pgTable(
  'job_skills',
  {
    jobId: uuid('job_id').notNull(),
    skillCode: text('skill_code').notNull(),
    required: boolean('required').notNull().default(true),
    minLevel: text('min_level', { enum: SKILL_LEVELS }).notNull().default('BEGINNER'),
  },
  (t) => [primaryKey({ columns: [t.jobId, t.skillCode] }), index('job_skills_job_idx').on(t.jobId)],
);
