-- 0038: remove the applicant DRAFT status (user decision 2026-11-09).
-- Every applicant profile is ACTIVE from creation now. Existing DRAFT rows
-- become ACTIVE with activatedAt backfilled to their creation time. The
-- applicants_active_needs_branch check only ever exempted DRAFT profiles,
-- so it goes away: a fresh self-registration has no branch until the
-- location step assigns one. The status check is recreated without DRAFT.
UPDATE "applicants" SET "status" = 'ACTIVE', "activated_at" = "created_at" WHERE "status" = 'DRAFT';
ALTER TABLE "applicants" DROP CONSTRAINT "applicants_active_needs_branch";
ALTER TABLE "applicants" DROP CONSTRAINT "applicants_status_valid";
ALTER TABLE "applicants" ADD CONSTRAINT "applicants_status_valid" CHECK ("applicants"."status" in ('ACTIVE', 'INACTIVE', 'RESTRICTED'));
ALTER TABLE "applicants" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
