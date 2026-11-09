-- C3/H19 (2026-11-08): record, on the match row, whether this match's HIRED
-- decision filled a vacancy (see syncMatchHire in
-- apps/web/src/domains/matching/service.ts). The decline path frees the
-- vacancy only when this flag is set — it is the proof that *this* match
-- filled it, not a placement accept that happened first. Defaults to false
-- for all existing rows (no past decline can retroactively free a vacancy),
-- and the Python matching engine's INSERT lists its columns explicitly, so
-- it keeps defaulting false there; the engine also preserves the flag across
-- re-runs (see services/matching/app/repository.py).
ALTER TABLE "job_matches" ADD COLUMN "vacancy_filled" boolean DEFAULT false NOT NULL;
