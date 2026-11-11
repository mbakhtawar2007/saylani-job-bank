# @jobbank/db — Drizzle schema, migrations, seeds

## Migrations: the journal is canonical

`migrations/meta/_journal.json` governs **apply order**. `db:migrate`
(`tsx src/scripts/migrate.ts`) applies the entries in journal order, not
filename order.

### Do NOT renumber migrations

The numeric prefixes are **historical, not sequential**:

- `0014` and `0015` each exist twice (`0014_job_benefits` /
  `0014_matching`, `0015_applications` / `0015_matching_perf`).
- `0016` and `0023` were never created and do not exist in the journal.
- Journal `when` timestamps are not chronological (the Rafeh merge
  renumbered `0018`/`0019` to `0042`/`0043`).

Renumbering would break applied-migration tracking: drizzle records applied
migrations by journal hash, so a renumbered file looks like a new migration
to every database that already applied the old one. Leave the numbers alone.
The 1:1 journal↔SQL correspondence is enforced by
`test/migrations.test.ts` ("registers every SQL migration in the journal") —
if you add a migration, the journal entry must match the file exactly.

### Snapshots are incomplete

`migrations/meta/*_snapshot.json` exists for only 24 of 46 migrations
(`0000`–`0013`, `0024`–`0032`, `0035`). The other 22 are missing, so
`drizzle-kit generate` / `check` / `push` cannot reconstruct schema state
for those steps and a future `generate` may produce an incorrect diff.

Regenerating them is a **laptop step, not a VM step**: on 2026-11-11
`drizzle-kit generate` was attempted in the VM and stopped on interactive
schema-conflict prompts (it needs a TTY and a human to resolve the
conflicts) — no files were changed. Run it on the laptop, backed up, with
a live database and a TTY, and review the diff before committing. Never
hand-edit `_journal.json`.

## Commands

- `db:generate` — `drizzle-kit generate` (see snapshot caveat above)
- `db:migrate` — apply pending migrations in journal order
- `db:seed` — seed reference data
- `db:studio` — Drizzle Studio
