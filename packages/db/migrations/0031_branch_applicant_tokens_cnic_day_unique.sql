CREATE UNIQUE INDEX "branch_applicant_tokens_branch_day_cnic_issued_unique" ON "branch_applicant_tokens" USING btree ("branch_id", "registration_day", "cnic") WHERE "status" = 'ISSUED';
