-- N25 — duplicate pre-check for migration 0031
-- (`packages/db/migrations/0031_branch_applicant_tokens_cnic_day_unique.sql`).
--
-- Migration 0031 is a bare CREATE UNIQUE INDEX on
-- (branch_id, registration_day, cnic) WHERE status = 'ISSUED'. It has no
-- duplicate pre-check of its own: if duplicate ISSUED tokens for the same
-- (branch, day, CNIC) already exist, applying it FAILS. Run this file
-- BEFORE `pnpm db:migrate` on any database that already has applicant
-- tokens (i.e. it ran 0028-0030 before 0031) — a fresh database has no
-- tokens, so the check trivially passes there.
--
-- How to run (owner role, same URL migrations use):
--   psql "$DATABASE_MIGRATOR_URL" -f scripts/ci/precheck-0031-duplicates.sql
--
-- PASS: the query below returns 0 rows. Apply 0031.
-- FAIL: it returns one row per duplicate group. Do NOT apply 0031 yet —
--   resolve first (see below), re-run this file until it returns 0 rows,
--   then migrate.
--
-- Resolution: keep exactly one live token per (branch, day, CNIC) — a
-- COMPLETED token if one exists (its registration is already done), else
-- the earliest-issued ISSUED token — and CANCEL every other ISSUED token
-- in the group. Run the commented UPDATE below in a transaction, then
-- re-run the check above until it returns 0 rows. Cancelling (not
-- deleting) preserves the audit trail, and matches the dedup semantics:
-- the same CNIC on the same day returns the same token.
--
-- Do NOT edit migration 0031 itself, and do NOT apply it blindly.

SELECT branch_id, registration_day, cnic, COUNT(*) AS issued_count
FROM branch_applicant_tokens
WHERE status = 'ISSUED'
GROUP BY branch_id, registration_day, cnic
HAVING COUNT(*) > 1
ORDER BY registration_day, branch_id, cnic;

-- -- Resolution (uncomment to run, in a transaction, after inspecting the
-- -- groups above):
-- BEGIN;
-- UPDATE branch_applicant_tokens t
-- SET status = 'CANCELLED'
-- WHERE t.status = 'ISSUED'
--   AND t.id NOT IN (
--     SELECT DISTINCT ON (branch_id, registration_day, cnic) id
--     FROM branch_applicant_tokens
--     WHERE status IN ('ISSUED', 'COMPLETED')
--     ORDER BY branch_id, registration_day, cnic,
--       (status = 'COMPLETED') DESC, issued_at ASC, id ASC
--   );
-- -- Re-run the SELECT above (still inside the transaction, or after COMMIT)
-- -- and confirm 0 rows before COMMIT; then apply migration 0031.
-- COMMIT;
