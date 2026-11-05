ALTER TABLE "account_tokens" ADD COLUMN "branch_id" uuid;
--> statement-breakpoint
ALTER TABLE "account_tokens" ADD COLUMN "registration_day" date;
--> statement-breakpoint
ALTER TABLE "account_tokens" ADD COLUMN "registration_sequence" integer;
--> statement-breakpoint
ALTER TABLE "account_tokens" ADD CONSTRAINT "account_tokens_branch_id_branches_id_fk"
  FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "account_tokens_branch_registration_seq_unique"
  ON "account_tokens" USING btree ("branch_id", "registration_day", "registration_sequence")
  WHERE "purpose" = 'BRANCH_REGISTRATION';
