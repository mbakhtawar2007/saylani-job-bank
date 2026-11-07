CREATE TABLE "branch_applicant_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"branch_id" uuid NOT NULL,
	"registration_day" date NOT NULL,
	"token_number" integer NOT NULL,
	"cnic" text NOT NULL,
	"applicant_name" text NOT NULL,
	"status" text DEFAULT 'ISSUED' NOT NULL,
	"applicant_id" uuid,
	"issued_by" uuid,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "branch_applicant_tokens_number_positive" CHECK ("branch_applicant_tokens"."token_number" > 0),
	CONSTRAINT "branch_applicant_tokens_cnic_format" CHECK ("branch_applicant_tokens"."cnic" ~ '^[1-9][0-9]{12}$'),
	CONSTRAINT "branch_applicant_tokens_status_valid" CHECK ("branch_applicant_tokens"."status" in ('ISSUED', 'COMPLETED', 'CANCELLED'))
);
--> statement-breakpoint
ALTER TABLE "branch_applicant_tokens" ADD CONSTRAINT "branch_applicant_tokens_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_applicant_tokens" ADD CONSTRAINT "branch_applicant_tokens_applicant_id_applicants_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."applicants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_applicant_tokens" ADD CONSTRAINT "branch_applicant_tokens_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "branch_applicant_tokens_branch_day_idx" ON "branch_applicant_tokens" USING btree ("branch_id","registration_day");--> statement-breakpoint
CREATE UNIQUE INDEX "branch_applicant_tokens_branch_day_number_unique" ON "branch_applicant_tokens" USING btree ("branch_id","registration_day","token_number");--> statement-breakpoint
CREATE INDEX "branch_applicant_tokens_cnic_idx" ON "branch_applicant_tokens" USING btree ("cnic");
