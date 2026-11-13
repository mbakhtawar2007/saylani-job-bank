-- NTN is optional on staff field-visit onboarding (2026-11-13, user):
-- a company visited in the field may not share its NTN on the spot.
-- The format check now allows NULL; the partial unique index
-- (companies_ntn_active_uq, live companies only) still stops two live
-- companies sharing one non-null NTN — Postgres treats NULLs as distinct.
-- Employer self-registration still requires an NTN at the schema level.
ALTER TABLE "companies" ALTER COLUMN "ntn" DROP NOT NULL;
ALTER TABLE "companies" DROP CONSTRAINT IF EXISTS "companies_ntn_format";
ALTER TABLE "companies" ADD CONSTRAINT "companies_ntn_format" CHECK ("ntn" IS NULL OR "ntn" ~ '^([0-9]{7}(-[0-9])?|[1-9][0-9]{12})$');
