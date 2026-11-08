CREATE TABLE "job_applicant_referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"applicant_id" uuid NOT NULL,
	"referred_by" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_applicant_referrals" ADD CONSTRAINT "job_applicant_referrals_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_applicant_referrals" ADD CONSTRAINT "job_applicant_referrals_applicant_id_applicants_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."applicants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_applicant_referrals" ADD CONSTRAINT "job_applicant_referrals_referred_by_users_id_fk" FOREIGN KEY ("referred_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_applicant_referrals_job_applicant_unique" ON "job_applicant_referrals" USING btree ("job_id","applicant_id");--> statement-breakpoint
CREATE INDEX "job_applicant_referrals_applicant_idx" ON "job_applicant_referrals" USING btree ("applicant_id");--> statement-breakpoint
CREATE INDEX "job_applicant_referrals_job_idx" ON "job_applicant_referrals" USING btree ("job_id");
