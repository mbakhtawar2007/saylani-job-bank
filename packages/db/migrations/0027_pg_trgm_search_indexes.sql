-- pg_trgm for the staff `ILIKE '%q%'` searches. Without a trigram index every
-- search is a sequential scan; with it, Postgres can use the GIN index for
-- substring matching. GIN has NO default operator class for text, so the
-- opclass `gin_trgm_ops` must be named on every index — plain USING gin
-- fails with 42704 ("You must specify an operator class for the index").
--
-- NOTE on production deploys: the repo's migrate runner applies each file
-- inside a transaction, so CREATE INDEX CONCURRENTLY cannot be used here.
-- On a table with significant rows, build these indexes CONCURRENTLY
-- out-of-band first (same names), then let this migration no-op past them —
-- or accept a brief write lock while each index builds. These six are small
-- text columns on modest tables, so a plain build is fine for this app.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX "users_name_trgm_idx" ON "users" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "users_email_trgm_idx" ON "users" USING gin ("email" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "applicants_full_name_trgm_idx" ON "applicants" USING gin ("full_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "companies_legal_name_trgm_idx" ON "companies" USING gin ("legal_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "companies_trade_name_trgm_idx" ON "companies" USING gin ("trade_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "jobs_title_trgm_idx" ON "jobs" USING gin ("title" gin_trgm_ops);
