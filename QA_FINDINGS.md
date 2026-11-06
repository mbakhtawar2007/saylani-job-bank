# Saylani Job Bank QA Findings

**Run date:** 2026-11-05<br>
**Scope:** QA only. No application code was changed, no commit or push was made, and the database was not reset.
**Note:** This file is a point-in-time snapshot of the 2026-11-05 QA run; its counts and claims describe the repo as it was then, not the current state.

## Summary

| Check                    | Result                                                                    |
| ------------------------ | ------------------------------------------------------------------------- |
| `GET /api/v1/health`     | HTTP 200; status `ok`; database, PostGIS, storage, and Redis are up       |
| Home page `/`            | HTTP 200                                                                  |
| Login page `/login`      | HTTP 200; sign-in options render                                          |
| `pnpm.cmd lint`          | Failed: 7 errors, 10 warnings                                             |
| `pnpm.cmd typecheck`     | Failed: 9 TypeScript errors                                               |
| `pnpm.cmd test`          | Failed: 41 web Vitest suites and 1 DB test failed                         |
| `pnpm.cmd test:jest`     | Failed: 4 suites/tests failed; 400 tests passed                           |
| `pnpm.cmd matching:test` | Passed: 31 tests                                                          |
| Browser E2E              | Not run; the aggregate `pnpm.cmd test` command stopped at the Vitest step |

## Issues

### QA-1 — Lint fails due to unused imports

- **Where:** `apps/web/src/app/(dashboard)/applicant/_components/ApplicantProfileView.tsx`
- **Steps to reproduce:** Run `pnpm.cmd lint`.
- **Expected:** Lint passes.
- **Actual:** `@jobbank/web#lint` exits with code 1.
- **Exact errors:** `@typescript-eslint/no-unused-vars` reports these imports as defined but never used:
  - Line 4: `APPLICANT_STATUS_LABELS`
  - Line 11: `ProfileSectionId`
  - Line 17: `Building2`
  - Line 18: `Calendar`
  - Line 20: `ChevronRight`
  - Line 21: `ExternalLink`
  - Line 30: `ShieldCheck`
- **Additional output:** 10 warnings (console statements, a missing React hook dependency, and `<img>` optimization warnings).

### QA-2 — Typecheck rejects the `outline` button variant

- **Where:** `apps/web/src/app/(dashboard)/applicant/_components/ApplicantProfileView.tsx`, `apps/web/src/app/(dashboard)/applicant/_components/ProfileWizard.tsx`, `apps/web/src/components/organisms/MapPinPicker/MapPinPickerClient.tsx`
- **Steps to reproduce:** Run `pnpm.cmd typecheck`.
- **Expected:** Typecheck passes.
- **Actual:** `@jobbank/web#typecheck` exits with code 2.
- **Exact error:** `TS2322: Type '"outline"' is not assignable to type '"link" | "primary" | "accent" | "danger" | "secondary" | "ghost" | null | undefined'.`
- **Locations:** `ApplicantProfileView.tsx` lines 246, 305, 355, 426, 513, 590, and 691; `ProfileWizard.tsx` line 121; `MapPinPickerClient.tsx` line 268.

### QA-3 — Web Vitest suites cannot load or transform tests

- **Where:** 41 suites under `apps/web/src`.
- **Steps to reproduce:** Run `pnpm.cmd test`.
- **Expected:** Workspace tests pass.
- **Actual:** Web Vitest reports `Test Files 41 failed | 13 passed (54)` and `Tests 105 passed (105)`. The failing suites error during parsing/import before executing their tests.
- **Exact errors, grouped by affected files:**

  **Unresolved `@/` package imports — `Error: Cannot find package ...`:**
  - `src/domains/applicant/applicant.integration.test.ts` — `@/app/api/v1/applicants/[id]/route`
  - `src/domains/applicant/rules.test.ts` — `@/domains/shared/state-machine`
  - `src/domains/matching/match-decisions.integration.test.ts` — `@/app/api/v1/jobs/[id]/matches/[applicantId]/route`
  - `src/domains/settings/settings.integration.test.ts` — `@/app/api/v1/branches/route`
  - `src/domains/user/policy.test.ts` — `@/test/factories`
  - `src/domains/user/staff-management.integration.test.ts` — `@/app/api/v1/account/2fa/confirm/route`
  - `src/lib/format/date.test.ts` — `@/design-system/tokens`
  - `src/lib/geospatial/geospatial.integration.test.ts` — `@/lib/db`
  - `src/lib/logger/logger.test.ts` — `@/lib/privacy/redact`
  - `src/domains/auth/auth.integration.test.ts` — `@/app/api/v1/auth/login/route`
  - `src/domains/shared/audit/audit.integration.test.ts` — `@/lib/db`
  - `src/domains/shared/events/events.test.ts` — `@/lib/logger`
  - `src/domains/shared/http/handler.test.ts` — `@/lib/db`
  - `src/domains/shared/idempotency/idempotency.integration.test.ts` — `@/lib/env`
  - `src/domains/shared/idempotency/idempotency.test.ts` — `@/lib/db`
  - `src/domains/shared/masking/masking.test.ts` — `@/lib/format/phone`
  - `src/domains/shared/rate-limit/rate-limit.test.ts` — `@/lib/logger`
  - `src/domains/shared/scope/scope.test.ts` — `@/test/factories`

  **Server-only import guard — `This module cannot be imported from a Client Component module. It should only be used from a Server Component.`**
  - `src/lib/s3/storage.integration.test.ts`
  - `src/lib/s3/storage.test.ts`
  - `src/domains/auth/otp.test.ts`

  **JSX import-analysis failure — `Failed to parse source for import analysis because the content contains invalid JS syntax. If you use tsconfig.json, make sure to not set jsx to preserve.`** The diagnostic points at `src/components/atoms/Avatar/Avatar.tsx:37:29`; affected suites are:
  - `src/components/atoms/Avatar/Avatar.test.tsx`
  - `src/components/atoms/Button/Button.test.tsx`
  - `src/components/molecules/ConfirmDialog/ConfirmDialog.test.tsx`
  - `src/components/molecules/FormField/FormField.test.tsx`
  - `src/components/molecules/OTPInput/OTPInput.test.tsx`
  - `src/components/organisms/DocumentList/DocumentList.test.tsx`

  **JSX parser failure — `Parse failed with 1 error: Unexpected JSX expression`:**
  - `src/app/(dashboard)/_components/master-data/MasterDataItemDialog.test.tsx:24`
  - `src/components/atoms/Select/Select.test.tsx:6`
  - `src/components/molecules/DistanceBadge/DistanceBadge.test.tsx:6`
  - `src/components/molecules/FileUploader/FileUploader.test.tsx:15`
  - `src/components/molecules/PhoneInput/PhoneInput.test.tsx:9`
  - `src/components/organisms/AppSidebar/AppSidebar.test.tsx:18`
  - `src/components/organisms/DataTable/DataTable.test.tsx:58`
  - `src/components/organisms/Stepper/Stepper.test.tsx:22`
  - `src/components/molecules/Pagination/Pagination.test.tsx:60`
  - `src/app/(dashboard)/applicant/_components/PersonalStep.test.tsx:26`
  - `src/app/(dashboard)/_components/settings/BranchRadiusForm.test.tsx:25`
  - `src/app/(dashboard)/_components/settings/WorkflowSettings.test.tsx:34`
  - `src/app/(dashboard)/employer/company/_components/CompanyWizard.test.tsx:76`
  - `src/app/(dashboard)/verifier/queue/[companyId]/_components/VerifierReviewPanel.test.tsx:67`

### QA-4 — DB document-type assertion fails

- **Where:** `packages/db/test/applicant-tables.integration.test.ts:102`
- **Steps to reproduce:** Run `pnpm.cmd test`.
- **Expected:** Only `EDUCATION_CERTIFICATE` and `EXPERIENCE_LETTER` are marked as multi-file document types.
- **Actual:** The query returns `HEALTHCARE_LICENSE`.
- **Exact error:** `AssertionError: expected [ 'HEALTHCARE_LICENSE' ] to deeply equal [ 'EDUCATION_CERTIFICATE', 'EXPERIENCE_LETTER' ]`
- **Test:** `document types > marks only certificates and letters as multi-file`. The DB test package reports 1 failed and 35 passed.

### QA-5 — Four Jest API tests fail

- **Steps to reproduce:** Run `pnpm.cmd test:jest`.
- **Expected:** All Jest suites pass.
- **Actual:** 4 suites failed, 9 passed; 4 tests failed and 400 passed.

1. **Required-document error text mismatch**
   - **Where:** `tests/api/applicants-documents.test.ts:497`
   - **Steps:** Run the `pnpm.cmd test:jest` suite containing `DELETE /api/v1/applicants/me/documents/{id} > refuses to remove a required document`.
   - **Expected:** Error message contains `Required documents`.
   - **Actual / exact error:** `Expected substring: "Required documents"`; received `This document is required for your selected job categories and cannot be removed`.

2. **Super Admin 2FA blocks test sign-in**
   - **Where:** `tests/api/applicants-list.test.ts:126` and `tests/api/helpers.ts:136`
   - **Steps:** Run Jest test `GET /api/v1/applicants — authentication and authorisation > refuses a Super Admin who has not enrolled 2FA yet`.
   - **Expected:** The test helper signs in and can assert the endpoint’s authorization response.
   - **Actual / exact error:** `sign-in failed for superadmin@jobbank.local: 200 {"data":{"kind":"two_factor_required","methods":["totp"]}}`

3. **Notifications stream violates error-envelope contract**
   - **Where:** `tests/api/envelope-contract.test.ts:120`
   - **Steps:** Run the Jest error-envelope contract test for `v1/notifications/stream`.
   - **Expected:** A JSON error envelope and `x-correlation-id` header.
   - **Actual / exact error:** `v1/notifications/stream: GET 401: missing x-correlation-id header | GET 401: body is not JSON (Unauthorized)`

4. **Super Admin 2FA blocks RBAC test sign-in**
   - **Where:** `tests/api/rbac.test.ts:22` and `tests/api/helpers.ts:136`
   - **Steps:** Run the Jest RBAC test `blocks a Super Admin who has not enrolled 2FA yet`.
   - **Expected:** The test helper signs in and can assert the endpoint’s denial response.
   - **Actual / exact error:** `sign-in failed for superadmin@jobbank.local: 200 {"data":{"kind":"two_factor_required","methods":["totp"]}}`

### QA-6 — Planned modules are missing or incomplete

- **Where:** Compared `IMPLEMENTATION_PLAN.md` phases/modules against `apps/web/src`.
- **Expected:** Planned module routes and UI are implemented for the corresponding delivery phases.
- **Actual:**
  - **M14 — Blacklist & Restrictions:** No blacklist domain, blacklist request/review API routes, or UI found.
  - **M17 — Reporting & Analytics:** No reporting domain, report API routes, or reporting UI found.
  - **M15 — Audit:** Audit-writing code exists, but the planned audit explorer UI was not found.
  - **M13 — Placement & Follow-ups:** A placement domain directory exists, but placement/follow-up API routes were not found.
  - **M11 — Interviews:** Interview-related application routes exist, but no dedicated interviews API or calendar UI was found.
  - **M19 — PWA:** No app manifest or service-worker implementation found.
  - **M2 — Malware scanning:** `apps/web/src/lib/s3/storage.ts:151` implements the scanner as `scan: async () => 'skipped'`; uploaded documents are not scanned by a real malware scanner.
- **Exact scanner behavior:** Every scan returns `'skipped'`. The code notes that a real scanner is deferred to Phase 4.
- **Search result:** No explicit `TODO` or `NotImplemented` markers were found in the searched source.

### QA-7 — Home-page links do not navigate to destinations

- **Where:** `apps/web/src/app/_landing/LandingPage.tsx`; e.g. line 815.
- **Steps to reproduce:** Open `/` and click the top navigation, popular-category, or footer links.
- **Expected:** Links navigate to their corresponding page or section.
- **Actual:** The rendered page contains 6 anchors with `href="#"` (corrected 2026-11-06; the earlier count of 36 was wrong).
- **Exact error:** No runtime error; the links resolve to `#` rather than a destination.

## E2E status

The root `pnpm.cmd test` script is `turbo run test --continue && pnpm test:jest && pnpm test:e2e`. Turbo/Vitest exited unsuccessfully, so the script short-circuited before the E2E command. Jest was run separately. Browser E2E results are therefore unavailable.

## Worktree note

`git status --short` showed `AGENTS.md` modified during QA. That pre-existing worktree change was not altered. Python `__pycache__` directories created by the matching tests were removed.
