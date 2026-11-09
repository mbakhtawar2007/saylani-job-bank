-- N13 (2026-11-08): drop the dead `willing_radius_m` column from
-- `applicant_preferences`. The matching radius has lived in
-- `match_radius_policies` since M5 (BRANCH scope, 10 km ceiling enforced by
-- `match_radius_policies_range`); nothing in the app reads or writes this
-- column — the only references were migration 0009 and one DB test asserting
-- its CHECK. Dropping the column also drops its CHECK constraint
-- `applicant_preferences_radius` (column-level CHECKs go with the column).
-- Written by hand, not via `db:generate`, so the drop is explicit and
-- reviewable. Next `db:generate` must emit nothing for this table.
ALTER TABLE "applicant_preferences" DROP COLUMN "willing_radius_m";
