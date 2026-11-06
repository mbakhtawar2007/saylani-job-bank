CREATE TABLE "company_onboarding" (
	"company_id" uuid PRIMARY KEY NOT NULL,
	"onboarded_by" uuid,
	"visit_date" date,
	"agreed" boolean DEFAULT true NOT NULL,
	"head_office_address" text,
	"other_sites" text,
	"workforce_roles" text,
	"workforce_type" text,
	"workforce_shifts" text,
	"workforce_openings" text,
	"years_in_business" text,
	"previous_hiring" text,
	"certifications" text,
	"additional_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_onboarding" ADD CONSTRAINT "company_onboarding_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_onboarding" ADD CONSTRAINT "company_onboarding_onboarded_by_users_id_fk" FOREIGN KEY ("onboarded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_onboarding_onboarded_by_idx" ON "company_onboarding" USING btree ("onboarded_by");--> statement-breakpoint
-- Backfill outreach records written before this table existed. The only source is
-- the `company.register` audit entry (staffOnboardCompany wrote the visit, the
-- agreement and the notes there). Defensive by design: rows whose company no
-- longer exists, whose id is not a uuid, or whose visit date is not a real
-- yyyy-mm-dd date are skipped, never failed; a company with several audit rows
-- keeps only its earliest agreed one.
INSERT INTO "company_onboarding" ("company_id", "onboarded_by", "visit_date", "agreed", "head_office_address", "other_sites", "workforce_roles", "workforce_type", "workforce_shifts", "workforce_openings", "years_in_business", "previous_hiring", "certifications", "additional_notes")
SELECT DISTINCT ON (a."entity_id")
	a."entity_id"::uuid,
	a."actor_user_id",
	CASE WHEN (a."after"->>'visitDate') ~ '^\d{4}-\d{2}-\d{2}$' THEN (a."after"->>'visitDate')::date
		WHEN (a."metadata"->>'visitDate') ~ '^\d{4}-\d{2}-\d{2}$' THEN (a."metadata"->>'visitDate')::date
		ELSE NULL END,
	true,
	NULLIF(a."after"->>'headOfficeAddress', ''),
	NULLIF(a."after"->>'otherSites', ''),
	NULLIF(a."after"->>'workforceRoles', ''),
	NULLIF(a."after"->>'workforceType', ''),
	NULLIF(a."after"->>'workforceShifts', ''),
	NULLIF(a."after"->>'workforceOpenings', ''),
	NULLIF(a."after"->>'yearsInBusiness', ''),
	NULLIF(a."after"->>'previousHiring', ''),
	NULLIF(a."after"->>'certifications', ''),
	NULLIF(a."after"->>'additionalNotes', '')
FROM "audit_logs" a
WHERE a."action" = 'company.register'
	AND a."entity_type" = 'company'
	AND (a."after"->>'agreed') = 'true'
	AND a."entity_id" ~ '^[0-9a-fA-F-]{36}$'
	AND EXISTS (SELECT 1 FROM "companies" c WHERE c."id" = a."entity_id"::uuid)
ORDER BY a."entity_id", a."occurred_at" ASC, a."id" ASC
ON CONFLICT ("company_id") DO NOTHING;
--> statement-breakpoint
SELECT jobbank_attach_updated_at('company_onboarding');
