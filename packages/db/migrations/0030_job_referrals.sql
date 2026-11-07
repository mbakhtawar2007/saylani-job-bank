CREATE TABLE "job_referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"referred_by" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_referrals" ADD CONSTRAINT "job_referrals_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_referrals" ADD CONSTRAINT "job_referrals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_referrals" ADD CONSTRAINT "job_referrals_referred_by_users_id_fk" FOREIGN KEY ("referred_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_referrals_job_company_unique" ON "job_referrals" USING btree ("job_id","company_id");--> statement-breakpoint
CREATE INDEX "job_referrals_company_idx" ON "job_referrals" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "job_referrals_job_idx" ON "job_referrals" USING btree ("job_id");