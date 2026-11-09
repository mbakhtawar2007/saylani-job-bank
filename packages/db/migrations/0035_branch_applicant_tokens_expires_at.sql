ALTER TABLE "branch_applicant_tokens" ADD COLUMN "expires_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "branch_applicant_tokens" SET "expires_at" = ((("registration_day" + 1) || ' 00:00:00+05:00')::timestamptz);
--> statement-breakpoint
ALTER TABLE "branch_applicant_tokens" ALTER COLUMN "expires_at" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "branch_applicant_tokens" ADD CONSTRAINT "branch_applicant_tokens_expires_after_issued" CHECK ("branch_applicant_tokens"."expires_at" > "branch_applicant_tokens"."issued_at");
--> statement-breakpoint
ALTER TABLE "branch_applicant_tokens" ADD CONSTRAINT "branch_applicant_tokens_number_max" CHECK ("branch_applicant_tokens"."token_number" <= 9999);
