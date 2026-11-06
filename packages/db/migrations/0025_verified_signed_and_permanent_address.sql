CREATE TABLE "applicant_permanent_addresses" (
	"applicant_id" uuid PRIMARY KEY NOT NULL,
	"address_line" text NOT NULL,
	"city_code" text NOT NULL,
	"area_code" text,
	"location" geography(Point, 4326),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_tokens" DROP CONSTRAINT "account_tokens_branch_id_branches_id_fk";
--> statement-breakpoint
DROP INDEX "account_tokens_branch_registration_seq_unique";--> statement-breakpoint
ALTER TABLE "applicants" ADD COLUMN "registration_verified_signed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "applicants" ADD COLUMN "registration_verified_signed_by" uuid;--> statement-breakpoint
ALTER TABLE "applicants" ADD COLUMN "additional_notes" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "registration_verified_signed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "registration_verified_signed_by" uuid;--> statement-breakpoint
ALTER TABLE "applicant_permanent_addresses" ADD CONSTRAINT "applicant_permanent_addresses_applicant_id_applicants_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."applicants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applicants" ADD CONSTRAINT "applicants_registration_verified_signed_by_users_id_fk" FOREIGN KEY ("registration_verified_signed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_registration_verified_signed_by_users_id_fk" FOREIGN KEY ("registration_verified_signed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_tokens" DROP COLUMN "branch_id";--> statement-breakpoint
ALTER TABLE "account_tokens" DROP COLUMN "registration_day";--> statement-breakpoint
ALTER TABLE "account_tokens" DROP COLUMN "registration_sequence";