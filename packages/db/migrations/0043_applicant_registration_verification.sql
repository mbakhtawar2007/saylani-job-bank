ALTER TABLE "applicants" ADD COLUMN "registration_reference" text;
--> statement-breakpoint
UPDATE "applicants"
SET "registration_reference" =
  'SJB-' || to_char("registered_at" AT TIME ZONE 'UTC', 'YYYY') || '-' ||
  upper(replace("id"::text, '-', ''));
--> statement-breakpoint
ALTER TABLE "applicants"
  ALTER COLUMN "registration_reference" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "applicants"
  ADD CONSTRAINT "applicants_registration_reference_unique"
  UNIQUE ("registration_reference");
--> statement-breakpoint
CREATE TABLE "applicant_verification_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "applicant_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "token_ciphertext" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid,
  "revoked_at" timestamp with time zone,
  "revoked_by" uuid
);
--> statement-breakpoint
ALTER TABLE "applicant_verification_tokens"
  ADD CONSTRAINT "applicant_verification_tokens_token_hash_unique"
  UNIQUE ("token_hash");
--> statement-breakpoint
CREATE UNIQUE INDEX "applicant_verification_tokens_active_applicant_idx"
  ON "applicant_verification_tokens" USING btree ("applicant_id")
  WHERE "is_active";
--> statement-breakpoint
CREATE INDEX "applicant_verification_tokens_applicant_idx"
  ON "applicant_verification_tokens" USING btree ("applicant_id", "created_at");
--> statement-breakpoint
ALTER TABLE "applicant_verification_tokens"
  ADD CONSTRAINT "applicant_verification_tokens_applicant_id_applicants_id_fk"
  FOREIGN KEY ("applicant_id") REFERENCES "public"."applicants"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "applicant_verification_tokens"
  ADD CONSTRAINT "applicant_verification_tokens_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "applicant_verification_tokens"
  ADD CONSTRAINT "applicant_verification_tokens_revoked_by_users_id_fk"
  FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "applicant_verification_tokens"
  ADD CONSTRAINT "applicant_verification_tokens_revocation_consistent"
  CHECK (
    ("is_active" and "revoked_at" is null and "revoked_by" is null)
    or (not "is_active" and "revoked_at" is not null)
  );
