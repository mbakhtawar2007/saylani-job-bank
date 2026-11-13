# Integration test fixes — 2026-11-11

Fixes for the 45 stale integration tests found on the first full run on the
laptop after the Najam port (`4cc29fa`) and the audit fixes (`ea1f6c8`)
landed on remote `dev`: 45 failed / 565 passed / 12 skipped (622 tests,
11 files failed, 80 passed).

**Verdict: all 45 are stale tests, zero real regressions.** No production
code was changed. Branch: `fix/integration-tests-2026-11-11` (from `ea1f6c8`).

## Clusters

| #   | Cluster                                     | Tests            | Verdict         | Fix                                                                                                                                                                                                                                                                                                                                                                                                                                   | Commit    |
| --- | ------------------------------------------- | ---------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1   | 2FA helper stale                            | 26               | Stale test      | `api-client.ts`: `signIn()` captures the H-02 `setupToken` onto the `Jar`; `enrollTwoFactor()` sends it to the enrol route. Never-enrolled 2FA-required admins get no session at login, only the token; the production LoginForm already handles this flow.                                                                                                                                                                           | `c18ee69` |
| 2   | Idempotency-Key missing                     | 12 (+ knock-ons) | Stale test      | `call()` in `api-client.ts` auto-generates a fresh `Idempotency-Key` for POST/PUT/PATCH/DELETE when the caller didn't supply one, never overriding an explicit key. The UI already sends keys on every form. Knock-ons resolved by this alone: applicant 409-vs-400 (`:112`) and 403-vs-400 (`:124`). Verified no integration test asserts the missing-key 400 via `call()` (`idempotency.integration.test.ts` doesn't use `call()`). | `c18ee69` |
| 3   | Token backdate vs 0035 constraint           | 3                | Stale test      | `tokens.integration.test.ts` `:237`, `:266`, `:288`: backdate `issued_at` in the same UPDATEs (`-2h`, `-2h`, `-2d`) so the pre-existing migration-0035 check `expires_at > issued_at` still holds.                                                                                                                                                                                                                                    | `c68c589` |
| 4   | Phone-change 422                            | 1                | Stale test      | `applicant.integration.test.ts`: M-21 requires a 6-digit `code` on the PUT; the test now POSTs `/phone/code` first, reads the code from the dev SMS outbox (same pattern as `signInApplicant`), then PUTs `{phone, reason, code}`.                                                                                                                                                                                                    | `d6a5e7b` |
| 5   | Notification count                          | 1                | Stale test      | `match-decisions.integration.test.ts`: the test marked only MATCH_HIRED read but asserted 0 unread overall; SHORTLISTED also notifies and stays unread by design. Assertion now scoped to the MATCH_HIRED row's `readAt`. No notification behaviour changed.                                                                                                                                                                          | `749ace0` |
| 6   | 403-vs-401 for blocked Super Admin          | 1                | Stale test      | `staff-management.integration.test.ts`: rewritten for the H-02 flow — assert the setup token, `/branches` → 401 (no session exists), enrol with `{password, setupToken}` (wrong password still 401), confirm with TOTP, then `/branches` → 200. Dropped the `/me` `twoFactorPending: true` assertion. Rest of the test stands.                                                                                                        | `7cabf32` |
| 7   | staff-registration 403-vs-201               | 1                | Stale test      | `staff-registration.integration.test.ts`: STAFF legitimately holds `applicant:create` since the Rafeh merge, so 201 is correct. Denied caller is now VERIFIER (`verifier.khi@jobbank.local`, no `applicant:create`, no 2FA requirement).                                                                                                                                                                                              | `a4dcc52` |
| 8   | SEED_DEV_PASSWORD never reached globalSetup | — (setup)        | Test config gap | `apps/web/vitest.config.ts`: `process.env.SEED_DEV_PASSWORD ??= rootEnv.SEED_DEV_PASSWORD ?? '';` next to the existing `TEST_DATABASE_MIGRATOR_URL` line. `test.env` reaches workers only; globalSetup seeds in the main process. Suite now runs without the shell export workaround.                                                                                                                                                 | `a7a8942` |
| 9   | Settings file (12 tests)                    | 12               | No separate fix | `settings.integration.test.ts` never ran — its `beforeAll` calls `signInAdmin`, so the cluster-1 helper fix should let it run. No changes made to the file itself.                                                                                                                                                                                                                                                                    | —         |

## Files changed

- `apps/web/src/test/api-client.ts`
- `apps/web/src/domains/applicant/tokens.integration.test.ts`
- `apps/web/src/domains/applicant/applicant.integration.test.ts`
- `apps/web/src/domains/matching/match-decisions.integration.test.ts`
- `apps/web/src/domains/user/staff-management.integration.test.ts`
- `apps/web/src/domains/applicant/staff-registration.integration.test.ts`
- `apps/web/vitest.config.ts`

## Verification (VM — no live DB here)

- Typecheck `apps/web`: 0 errors.
- ESLint on all touched files: 0 errors.
- Prettier on all touched files: pass.
- Web unit + component suites (`vitest run --project unit --project components`):
  74 files, 475 tests, all passed.
- **Integration suite NOT run in the VM** (no live DB). Laptop re-run is the
  verification step:
  `pnpm.cmd --filter @jobbank/web test -- --project integration`

## Still open (not part of this fix)

- Migration 0038's statement order (UPDATE before DROP CONSTRAINT) is a known
  wart for stale DBs with DRAFT applicants; editing the applied migration is
  risky — left alone unless a fresh decision is made.
- `pnpm db:generate` snapshot regeneration is still a laptop step.

## Round 2 — proof run 2026-11-11 ~18:10 PKT

Proof run on the laptop after round 1 landed (`47cf94a`): **8 failed /
610 passed / 4 skipped (622 tests, 7 files failed, 84 passed)** — down from 45. The 4 skipped are the verifier-onboard suite, which never ran.

**Verdict: all 8 failures + the skipped suite are stale tests, zero real
regressions.** No production code was changed. Branch:
`fix/integration-tests-round2-2026-11-11` (from `47cf94a`).

| #   | Failure                                                                                                      | Verdict                                                                       | Fix                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `verifier-onboard` suite fails in `beforeAll`: `no authenticator enrolled for branchadmin.khi@jobbank.local` | Stale test                                                                    | This was the only file signing an admin in with plain `signIn()`; other files leave Branch Admin 2FA-enrolled in the shared DB, so plain sign-in hits `two_factor_required` with no secret in this file. Both sign-ins now use `signInAdmin()`.                                                                                                                         |
| 2   | `applicant.integration` identity test: `body.data` undefined at `:753`                                       | Stale test (DB pollution)                                                     | The hardcoded email `ayesha@example.com` was consumed by round 1's own passing run in the persistent DB, so the PATCH now returns 409 EMAIL_TAKEN. The test uses a unique email per run and asserts the 200 first. Production lock behaviour unchanged (`IDENTITY_FIELDS` excludes email).                                                                              |
| 3   | `applicant.integration` transfer: BA KHI→LHR gets 403 SCOPE_VIOLATION                                        | Stale test vs deliberate M13 rule                                             | `transferApplicant` (`staff.ts:1789-1798`, since the 2026-11-08 snapshot `51f5450`) forbids a Branch Admin moving an applicant to a branch outside their own branches. The test now asserts staff → 403 (no permission), BA cross-city → 403 (M13), Super Admin cross-city → 200. **Flagged for the user to confirm:** overturning M13 is a one-line production change. |
| 4   | `staff-profile-update`: BA own-branch update expected 403, got 200                                           | Stale test (Rafeh's read-only BA)                                             | The route requires `applicant:manage`, held by SUPER_ADMIN, BRANCH_ADMIN and STAFF (`permissions.test.ts`: "Branch Admin is NOT read-only"). Own-branch update is now 200; cross-branch stays 403.                                                                                                                                                                      |
| 5   | `staff-registration`: BA own-branch registration expected 403, got 201                                       | Stale test (Rafeh's `688a8c5`)                                                | The route requires `applicant:create`, held by SUPER_ADMIN, BRANCH_ADMIN and STAFF. Own-branch registration is now 201; cross-branch stays 403.                                                                                                                                                                                                                         |
| 6   | `tokens`: first token is 012, not 001                                                                        | Stale test (shared-DB pollution)                                              | Token numbers are per branch per day and parallel files issue KHI-GULSHAN tokens the same day, so absolute numbering is unassertable. The test now asserts the sequence is consecutive (second = first + 1) with matching codes.                                                                                                                                        |
| 7   | `tokens` re-issue: lookup by old code returns 1 row, not 2                                                   | Stale test (internally inconsistent, written in the M-06 fix, never run live) | The fresh token takes the next number, so it has a different code — the old code can only find the cancelled token. Assertions now check membership both ways (old code contains the CANCELLED token, not the fresh one; new code contains the ISSUED token, not the old one), robust to same numbers on earlier days.                                                  |
| 8   | `verification` QR rotate: BA expected 403, got 200                                                           | Stale test (Rafeh's read-only BA)                                             | The route requires `applicant:manage`, held by Branch Admin. Denied caller is now VERIFIER; BA rotates (200) and Super Admin rotates (200).                                                                                                                                                                                                                             |
| 9   | `staff-management` resend invite: expected 200, got 409                                                      | Stale test vs deliberate L-29 decision                                        | `resendInvitation` refuses a resend within 5 minutes of the invite (audit fix L-29, `AUDIT_FIXES_2026-11-11.md:99`). The test ages the pending invite 10 minutes via `account_tokens.created_at`, adds the idempotency key, and asserts the invite itself is 201 first. `issueAccountToken` revokes the old token, so the old-link-400 / new-link-200 tail stands.      |

## Round 2 verification (VM — no live DB here)

- Typecheck `apps/web`, `packages/shared`, `packages/db`: 0 errors each.
- ESLint on all touched files: 0 errors. Prettier: pass.
- Web unit + component suites (`vitest run --project unit --project components`):
  475 tests, all passed.
- **Integration suite NOT run in the VM** (no live DB). Laptop re-run is the
  verification step:
  `pnpm.cmd --filter @jobbank/web test -- --project integration`
- Residual flake risk (not fixed): `staff-management`'s 2FA test briefly
  enrols `verifier.khi@jobbank.local` and disables it again in the same test;
  a file whose `beforeAll` plain-signs-in the verifier at that exact moment
  would hit the same `totpCode` error as round-2 item 1. Only
  `verifier-onboard` was hit in practice.

---

## Round 3 — proof run 2026-11-11 ~18:44 PKT: 7 failed / 615 passed (622)

> Replay note, 2026-11-13: this section was written for the round-3 branch
> (`3ce8cad`) and replayed onto remote `dev` `41170982`. By then fix14
> (`8748fd5`) had already fixed the production defect differently — SQL
> `ST_Distance` nearest-first ordering in `setMyLocation`, instead of the
> `listBranchOptions` version described in rows #1–#4 — and had already
> covered rows #5–#6 with a CNIC_FRONT upload inside `onboardedCompany()`.
> What the replay actually kept: the row-#7 list assertion (both companies
> visible), the Hyderabad city for the radius-test branch, and this record.
> Dropped as redundant: the `profile.ts` change, the NTN upload helper,
> and the explicit branch DELETE (`restoreGlobals` already removes it).

Branch: `fix/integration-tests-round3-2026-11-11` (from `2ab64d7`).

**Verdict: 4 failures share one REAL production defect (nondeterministic
branch assignment); 3 are stale tests.** One small production change was
made, with the user's explicit go-ahead (options widget, 18:54 PKT).

| #   | Failure                                                                                                       | Verdict                                | Fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `applicant.integration` CNIC test: message names "Radius test branch", not "Karachi — Gulshan-e-Iqbal"        | Real defect (production)               | `setMyLocation` assigned `cityBranches[0]` from an unordered LIMIT 1 query — an arbitrary same-city branch. The settings suite's leftover "Radius test branch" (Karachi, one more per run, never deleted) won the lottery in this run. Now assigns the NEAREST active branch in the chosen city, reusing the branch-options ordering (`listBranchOptions`), so the suggestion and the assignment agree. In production there is one branch per city, so behaviour is unchanged live. |
| 2   | `applicant.integration` nearest-branch test: location save assigns `R-DD4B60`, not `KHI-GULSHAN`              | Same defect as #1                      | Same fix. (The branch-options suggestion itself was correct — KHI first — only the assignment was arbitrary.)                                                                                                                                                                                                                                                                                                                                                                       |
| 3   | `applicant.integration` search test: row `branchName` is "Radius test branch"                                 | Same defect as #1                      | Same fix — the searched applicant's branch is now deterministically KHI-GULSHAN.                                                                                                                                                                                                                                                                                                                                                                                                    |
| 4   | `applicant.integration` transfer test: Super Admin transfer 409 "branch has changed" (expectedBranchId `khi`) | Same defect as #1                      | Same fix — the applicant's actual branch is KHI-GULSHAN again, so `expectedBranchId: khi` matches.                                                                                                                                                                                                                                                                                                                                                                                  |
| 5   | `verifier-onboard` mark-signed: 409 DOCUMENTS_MISSING                                                         | Stale test vs deliberate N15 floor     | The Nov 9 N15 floor requires ≥1 required document (UPLOADED, not rejected) before mark-signed. The test (written Nov 8, first live run in round 2) never uploaded one. It now uploads an NTN_CERTIFICATE (required for PRIVATE_LIMITED) via the staff presign → PUT → confirm flow before mark-signed.                                                                                                                                                                              |
| 6   | `verifier-onboard` claim/verify: same 409 DOCUMENTS_MISSING                                                   | Same as #5                             | Same upload helper before mark-signed.                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 7   | `verifier-onboard` list: verifier sees the Branch Admin's company                                             | Stale test vs current permission model | Verifiers hold `company:manage` (Nov 8 "verifiers manage companies" model, `permissions.test.ts:31-33`), so the `createdBy` scope in `listCompanies` does not apply to them — the list is city-scoped. The test now asserts the list contains BOTH companies. Legal-field correction stays role-gated to SA/BA (H-01 fix), so this does not reopen H-01.                                                                                                                            |

Test hygiene (settings suite): the radius test's branch is no longer created
in Karachi — its city is now Hyderabad (the test only exercises radius
resolution, the city is irrelevant) — and the branch is deleted at the end of
the test, after its radius policies. Leftover `R-*` branches from earlier runs
stay in the laptop DB (some have applicants assigned, so they cannot be
deleted); with nearest-assignment they can no longer win an assignment.

## Round 3 verification (VM — no live DB here)

- Typecheck `apps/web`, `packages/shared`, `packages/db`: 0 errors each.
- ESLint on all touched files: 0 errors (one unused `ilike` import removed
  after the production edit). Prettier: pass.
- Web unit + component suites (`vitest run --project unit --project components`):
  475 tests, all passed.
- **Integration suite NOT run in the VM** (no live DB). Laptop re-run is the
  verification step:
  `pnpm.cmd --filter @jobbank/web test -- --project integration`
