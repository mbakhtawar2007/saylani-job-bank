-- Permanent record of employer decisions, with evidence required for every rejection.
-- Ported from Najam 0024_employer_decisions.sql (2026-11-11), adapted: the
-- REJECTED evidence threshold is 5 characters, matching this repo's M19 rule
-- (recordEmployerDecision requires a note of at least 5 characters), not
-- Najam's 10. reason_code stays nullable: this repo's decision input has no
-- reason-code field, so rows record the note as evidence and null reason.
CREATE TABLE "employer_decisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "job_id" uuid NOT NULL,
  "applicant_id" uuid NOT NULL,
  "application_id" uuid,
  "decision" text NOT NULL,
  "reason_code" text,
  "evidence" text,
  "decided_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "employer_decisions_decision_check" CHECK ("decision" IN (
    'HOLD','ACCEPTED','REJECTED','NEW','REVIEWED','SHORTLISTED','HIRED'
  )),
  CONSTRAINT "employer_decisions_reject_evidence" CHECK (
    "decision" <> 'REJECTED' OR ("evidence" IS NOT NULL AND length(trim("evidence")) >= 5)
  )
);
--> statement-breakpoint
CREATE INDEX "employer_decisions_application_idx" ON "employer_decisions" ("application_id");
--> statement-breakpoint
CREATE INDEX "employer_decisions_job_applicant_idx" ON "employer_decisions" ("job_id", "applicant_id");
--> statement-breakpoint
SELECT jobbank_make_append_only('employer_decisions');
