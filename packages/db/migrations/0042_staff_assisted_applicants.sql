ALTER TABLE "applicants"
  ADD COLUMN "registration_source" text DEFAULT 'SELF_SERVICE' NOT NULL,
  ADD COLUMN "registered_by" uuid,
  ADD COLUMN "registered_at" timestamp with time zone DEFAULT now() NOT NULL,
  ADD COLUMN "contact_confirmed_by" uuid,
  ADD COLUMN "contact_confirmed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "applicants"
  ADD CONSTRAINT "applicants_registration_source_valid"
  CHECK ("applicants"."registration_source" in ('SELF_SERVICE', 'STAFF_ASSISTED'));
--> statement-breakpoint
ALTER TABLE "applicants"
  ADD CONSTRAINT "applicants_registered_by_users_id_fk"
  FOREIGN KEY ("registered_by") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "applicants"
  ADD CONSTRAINT "applicants_contact_confirmed_by_users_id_fk"
  FOREIGN KEY ("contact_confirmed_by") REFERENCES "public"."users"("id")
  ON DELETE set null ON UPDATE no action;
