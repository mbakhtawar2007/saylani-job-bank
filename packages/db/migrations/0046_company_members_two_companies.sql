-- One employer account may register up to two companies (2026-11-12):
-- drop the one-company-per-user unique constraint on company_members.
-- The (company_id, user_id) primary key still stops the same account joining
-- the same company twice, and the two-company cap itself is enforced by the
-- registerCompany domain guard (ALREADY_REGISTERED at the third company).
ALTER TABLE "company_members" DROP CONSTRAINT IF EXISTS "company_members_user_id_unique";
