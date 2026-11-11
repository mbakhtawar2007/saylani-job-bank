# Integration test fixes — 2026-11-11

Fixes for the 45 stale integration tests found on the first full run on the
laptop after the Najam port (`4cc29fa`) and the audit fixes (`ea1f6c8`)
landed on remote `dev`: 45 failed / 565 passed / 12 skipped (622 tests,
11 files failed, 80 passed).

**Verdict: all 45 are stale tests, zero real regressions.** No production
code was changed. Branch: `fix/integration-tests-2026-11-11` (from `ea1f6c8`).

## Clusters

| # | Cluster | Tests | Verdict | Fix | Commit |
|---|---|---|---|---|---|
| 1 | 2FA helper stale | 26 | Stale test | `api-client.ts`: `signIn()` captures the H-02 `setupToken` onto the `Jar`; `enrollTwoFactor()` sends it to the enrol route. Never-enrolled 2FA-required admins get no session at login, only the token; the production LoginForm already handles this flow. | `c18ee69` |
| 2 | Idempotency-Key missing | 12 (+ knock-ons) | Stale test | `call()` in `api-client.ts` auto-generates a fresh `Idempotency-Key` for POST/PUT/PATCH/DELETE when the caller didn't supply one, never overriding an explicit key. The UI already sends keys on every form. Knock-ons resolved by this alone: applicant 409-vs-400 (`:112`) and 403-vs-400 (`:124`). Verified no integration test asserts the missing-key 400 via `call()` (`idempotency.integration.test.ts` doesn't use `call()`). | `c18ee69` |
| 3 | Token backdate vs 0035 constraint | 3 | Stale test | `tokens.integration.test.ts` `:237`, `:266`, `:288`: backdate `issued_at` in the same UPDATEs (`-2h`, `-2h`, `-2d`) so the pre-existing migration-0035 check `expires_at > issued_at` still holds. | `c68c589` |
| 4 | Phone-change 422 | 1 | Stale test | `applicant.integration.test.ts`: M-21 requires a 6-digit `code` on the PUT; the test now POSTs `/phone/code` first, reads the code from the dev SMS outbox (same pattern as `signInApplicant`), then PUTs `{phone, reason, code}`. | `d6a5e7b` |
| 5 | Notification count | 1 | Stale test | `match-decisions.integration.test.ts`: the test marked only MATCH_HIRED read but asserted 0 unread overall; SHORTLISTED also notifies and stays unread by design. Assertion now scoped to the MATCH_HIRED row's `readAt`. No notification behaviour changed. | `749ace0` |
| 6 | 403-vs-401 for blocked Super Admin | 1 | Stale test | `staff-management.integration.test.ts`: rewritten for the H-02 flow — assert the setup token, `/branches` → 401 (no session exists), enrol with `{password, setupToken}` (wrong password still 401), confirm with TOTP, then `/branches` → 200. Dropped the `/me` `twoFactorPending: true` assertion. Rest of the test stands. | `7cabf32` |
| 7 | staff-registration 403-vs-201 | 1 | Stale test | `staff-registration.integration.test.ts`: STAFF legitimately holds `applicant:create` since the Rafeh merge, so 201 is correct. Denied caller is now VERIFIER (`verifier.khi@jobbank.local`, no `applicant:create`, no 2FA requirement). | `a4dcc52` |
| 8 | SEED_DEV_PASSWORD never reached globalSetup | — (setup) | Test config gap | `apps/web/vitest.config.ts`: `process.env.SEED_DEV_PASSWORD ??= rootEnv.SEED_DEV_PASSWORD ?? '';` next to the existing `TEST_DATABASE_MIGRATOR_URL` line. `test.env` reaches workers only; globalSetup seeds in the main process. Suite now runs without the shell export workaround. | `a7a8942` |
| 9 | Settings file (12 tests) | 12 | No separate fix | `settings.integration.test.ts` never ran — its `beforeAll` calls `signInAdmin`, so the cluster-1 helper fix should let it run. No changes made to the file itself. | — |

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
