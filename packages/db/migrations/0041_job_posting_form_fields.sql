-- 0041: job posting form fields (user decisions 2026-11-10).
--
-- Rotation-only shift + shift hours, minimum salary PKR 41,700, experience
-- bands (Fresher / Beginner 3-6 months / Intermediate 1-3 years / Expert
-- 3+ years), structured medical cover (OPD / IPD limits + Individual /
-- Family scope), standard leaves Annual 14 / Sick 10 / Casual 10, bonus
-- basis / amount / frequency, and a designation code whose salary range
-- lives in DESIGNATION master data (no rows seeded yet — see the seed).
--
-- Existing rows: shift keeps its stored value (only new postings are
-- rotation-only); NULL leave days take the standard entitlement; legacy
-- medicalCoverage / bonusTier values are kept as-is (OPD/IPD limits and
-- bonus basis are NULL until the job is edited).
ALTER TABLE jobs ADD COLUMN shift_hours smallint;
--> statement-breakpoint
ALTER TABLE jobs ADD COLUMN designation_code text;
--> statement-breakpoint
ALTER TABLE jobs ADD COLUMN sick_leave_days smallint;
--> statement-breakpoint
ALTER TABLE jobs ADD COLUMN casual_leave_days smallint;
--> statement-breakpoint
ALTER TABLE jobs ADD COLUMN opd_limit integer;
--> statement-breakpoint
ALTER TABLE jobs ADD COLUMN ipd_limit integer;
--> statement-breakpoint
ALTER TABLE jobs ADD COLUMN medical_coverage_scope text;
--> statement-breakpoint
ALTER TABLE jobs ADD COLUMN bonus_basis text;
--> statement-breakpoint
ALTER TABLE jobs ADD COLUMN bonus_amount_pkr integer;
--> statement-breakpoint
ALTER TABLE jobs ADD COLUMN bonus_frequency text;
--> statement-breakpoint
ALTER TABLE jobs ADD CONSTRAINT jobs_salary_min_floor CHECK (salary_min IS NULL OR salary_min >= 41700);
--> statement-breakpoint
ALTER TABLE jobs ADD CONSTRAINT jobs_salary_max_floor CHECK (salary_max IS NULL OR salary_max >= 41700);
--> statement-breakpoint
ALTER TABLE jobs ADD CONSTRAINT jobs_shift_hours_range CHECK (shift_hours IS NULL OR (shift_hours >= 1 AND shift_hours <= 24));
--> statement-breakpoint
UPDATE jobs
SET annual_leave_days = COALESCE(annual_leave_days, 14),
    sick_leave_days = COALESCE(sick_leave_days, 10),
    casual_leave_days = COALESCE(casual_leave_days, 10);
--> statement-breakpoint
ALTER TABLE job_requirements ADD COLUMN experience_level text;
--> statement-breakpoint
ALTER TABLE job_requirements ADD COLUMN min_experience_months smallint;
