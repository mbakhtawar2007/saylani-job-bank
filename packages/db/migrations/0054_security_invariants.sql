-- 0054: add database backstops for verified-company job posting and
-- evidence-backed match rejection.

CREATE OR REPLACE FUNCTION job_require_verified_company() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE company_status text;
BEGIN
  SELECT status INTO company_status
  FROM companies
  WHERE id = NEW.company_id
  FOR SHARE;

  IF company_status IS DISTINCT FROM 'VERIFIED' THEN
    RAISE EXCEPTION 'jobs may only be posted by verified companies'
      USING ERRCODE = '23514', CONSTRAINT = 'jobs_company_verified';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS jobs_require_verified_company ON jobs;
--> statement-breakpoint
CREATE TRIGGER jobs_require_verified_company
  BEFORE INSERT OR UPDATE OF company_id ON jobs
  FOR EACH ROW EXECUTE FUNCTION job_require_verified_company();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION job_matches_require_rejection_evidence() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.review_status = 'REJECTED'
     AND length(btrim(coalesce(NEW.review_note, ''))) < 5 THEN
    RAISE EXCEPTION 'rejected matches require evidence in the review note'
      USING ERRCODE = '23514', CONSTRAINT = 'job_matches_reject_evidence';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS job_matches_require_rejection_evidence ON job_matches;
--> statement-breakpoint
CREATE TRIGGER job_matches_require_rejection_evidence
  BEFORE INSERT OR UPDATE OF review_status, review_note ON job_matches
  FOR EACH ROW EXECUTE FUNCTION job_matches_require_rejection_evidence();
