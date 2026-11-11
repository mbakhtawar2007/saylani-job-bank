-- Staff can register job seekers at a counter; those candidates have no login.
-- Ported from Najam 0025_counter_registration.sql (2026-11-11), adapted:
-- the users.phone_number unique constraint is deliberately KEPT. This repo
-- signs applicants in by phone OTP, and a shared number would make the OTP
-- lookup ambiguous (verifyOTP takes the first row for a number). Counter
-- registration therefore refuses a phone that already has an account
-- (409 PHONE_TAKEN); the phone field is optional, so a candidate without
-- their own number is registered with no phone and checks in at the branch.
ALTER TABLE "applicants"
  ADD COLUMN "counter_registered_by" uuid,
  ADD COLUMN "consent_confirmed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "applicants"
  ADD CONSTRAINT "applicants_counter_registered_by_users_id_fk"
  FOREIGN KEY ("counter_registered_by") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
-- Which status the candidate was last phoned about, so the call list only shows news.
ALTER TABLE "applications"
  ADD COLUMN "last_call_status" text,
  ADD COLUMN "last_called_at" timestamp with time zone,
  ADD COLUMN "last_called_by" uuid;
