# Audit fixes — 2026-11-11

Head audited: `4cc29fa` (`port/najam-counter-act-for-employer`). Fix branch: `fix/audit-2026-11-11`.
Audit report: `AUDIT_REPORT_2026-11-11.md` (untracked, not committed).
Rules: no push, no migrate, no deploy, no re-seed, no history rewrite. Integration/E2E not run (no live DB in VM).

Status: `fixed` (with commit) / `remaining` / `decision-needed` / `laptop-step`.

## High

| ID | Status | Commit / note |
|----|--------|---------------|
| H-01 | fixed | 1be1620 — assertRole SUPER_ADMIN/BRANCH_ADMIN in correctCompanyDetails; verifiers excluded, so no conflict check needed |
| H-02 | fixed | 1be1620 — login returns two_factor_setup_required (HMAC setup token, 15 min, no session); setup-token enrol path + LoginForm setup mode; pending session only during active enrolment |
| H-03 | fixed | 1f4f35c — requireOwnCompany honours actor.companyId when present (act-for-employer), falling back to membership lookup; integration test must still run on laptop (not verified live) |
| H-04 | fixed | 1f4f35c — GET /applicants list scoped by applicant branch city (branchCityScope on a.branchId); address-less / out-of-city-address applicants now listed |
| H-05 | fixed | 1f4f35c — DOCUMENT_REVIEW updates only uploaded CNIC sides (null-safe); rejecting a never-uploaded CNIC no longer 500s |
| H-06 | fixed | 1be1620 — canManageUser asserted in revokeRole after loadTarget, mirroring grantRole |
| H-07 | fixed | 1e89ad5 — both job forms validate client-side with the server schema (createJobSchema / updateJobSchema / staff extended schema) before any API call; FormErrorSummary + useFocusFieldErrors + field ids on every validated field; API 422 issues mapped back to fields |
| H-08 | fixed | 1e89ad5 — StaffRegisterApplicantForm wired into FormErrorSummary + useFocusFieldErrors (failed review now jumps to the first bad field); field ids + per-field errors on personal/address/education/experience/certification/preference fields; skills & languages rows stay bare atoms (no FormField to anchor) |
| H-09 | fixed | 8edffa5 — employer interview scheduling implemented: scheduleEmployerInterview + updateEmployerInterviewStatus (decision:employer, own-company check), route applications/[id]/employer-interview, EmployerInterviewScheduler UI in ReferralDetail; employer owns the interview once scheduled; applicant notified on every change |
| H-10 | fixed | 8edffa5 — referApplicantToEmployer requires OPEN (pre-check + locked re-check in tx) via shared job guard |
| H-11 | fixed | 8edffa5 — shared job guard (job/status-guard.ts): decisions/accepts/interviews blocked unless OPEN/PAUSED, re-checked under job lock; company VERIFIED re-checked on decisions; applicant Jobs page already badges non-OPEN jobs (page.tsx:40-45) |
| H-12 | fixed | 8edffa5 — acceptJobOffer vacancy guard under job lock (ConflictError NO_VACANCY); double-accept loser gets a clear 409, not a cryptic 422 |
| H-13 | fixed | 3a1f066 — git rm public/final-hero-video.mp4 (88 MB, zero references) |
| H-14 | fixed | 3a1f066 — deleted both applicants/new routes (branch-admin + super-admin) and the "Register job seeker" button on the applicants list; registration starts at the sidebar "Issue token" dialog and completes via the form in edit mode. No test or referenced flow broke (verified: no remaining references, tsc clean) |

## Medium

| ID | Status | Commit / note |
|----|--------|---------------|
| M-01 | fixed | ff68559 — assisted form no longer defaults to a Karachi-centre pin: lat/lng start null, MapPinPicker shows no pin (map still centres on Karachi), parse() fails with a plain "place the pin" error on address.location |
| M-02 | fixed | ff68559 — assisted schema phone now uses pkMobileSchema (same as dialog path); address stays required in the assisted path (counter collects it in person; matching/branch logic needs it), optional in the dialog/token-completion path |
| M-03 | fixed | ff68559 — CounterRegisterForm: API issues for fields the form does not render (e.g. branchId) now fall back to the alert instead of silently dying |
| M-04 | fixed | ff68559 — employer decision modal: note labelled required + "at least 5 characters" hint when REJECTED, Confirm disabled until ≥5 chars, maxLength 500, field issue surfaced on the note via issueFor('note') |
| M-05 | fixed | ff68559 — shortlist dialog: error={errors.note} + maxLength 500 on the note; Refer to employer dialog: note issue surfaced on the field (noteError state) + maxLength 500 |
| M-06 | fixed | COMMIT — expired ISSUED tokens are auto-cancelled (audited, reason 'expired') and a fresh token issued, in the existing-token branch and the race-winner path; integration tests added (NOT run here — no live DB; laptop must run tokens.integration.test.ts) |
| M-07 | fixed | COMMIT — code lookup returns all days' tokens for the number (most recent first, limit 30); dialog shows each result's Pakistan issue date and refreshes the selected row by id; integration test added (NOT run here — laptop) |
| M-08 | fixed | COMMIT — Print hidden for cancelled/completed/expired tokens (explanatory note instead); slip shows a Status row (CANCELLED/COMPLETED/EXPIRED — not valid) for non-live tokens, valid slips unchanged |
| M-09 | fixed | 8edffa5 — scheduleInterview/updateInterviewStatus require live job (OPEN/PAUSED, pre-check + locked re-check); docstring corrected to Staff / Branch Admin |
| M-10 | fixed | 8edffa5 — recordEmployerDecision sets lastCallStatus: null, so a repeat HOLD re-appears in the call list |
| M-11 | fixed | 3a80b40 — legal correction clears registrationVerifiedSignedAt/By; verifyCompany blocks onboarded companies until a fresh mark-signed for the current round (signedAt >= round.submittedAt; resubmits reuse the round so INFO_REQUESTED flow is unaffected; employer self-registered companies exempt) |
| M-12 | pending | |
| M-13 | decision-needed | Product decision: include INACTIVE applicants in matching pool, or document ACTIVE-only |
| M-14 | pending | Port from fork clone only if diff is clear and self-contained; else remaining |
| M-15 | pending | |
| M-16 | pending | Victim notification only; second-admin approval is decision-needed |
| M-17 | pending | |
| M-18 | pending | |
| M-19 | pending | |
| M-20 | pending | Phase 4 work; attempt only if straightforward and safe, else remaining |
| M-21 | pending | |
| M-22 | fixed | 3a1f066 — idempotent: true on POST /api/v1/applicants; dialog now sends an Idempotency-Key |
| M-23 | pending | |
| M-24 | fixed | 3a80b40 — markApplicantRegistrationVerifiedSigned now 409s SELF_ATTESTATION when row.counterRegisteredBy is the actor, mirroring the company path |
| M-25 | pending | |
| M-26 | fixed | 3a1f066 — idempotent: true on POST /jobs/me + POST /companies/me/sites; JobWizard create sends a key. Found while fixing: StaffPostJobForm posted to the already-idempotent POST /jobs with NO key, so every staff job post 400d — key added there too |
| M-27 | pending | |
| M-28 | pending | |
| M-29 | pending | |
| M-30 | pending | |
| M-31 | pending | |
| M-32 | laptop-step | LAPTOP-ONLY, coordinated: renumber 0014/0015 + regenerate 22 missing snapshots. Do NOT hand-edit _journal.json |
| M-33 | pending | |
| M-34 | pending | |

## Low

| ID | Status | Commit / note |
|----|--------|---------------|
| L-01 | fixed | 2547821 — CompanyWizard: noValidate on all three step forms; Details/Contacts/Location validate client-side against register/updateCompany, companyContacts and companyHeadOffice schemas with FormErrorSummary + focus + per-field errors; bare acme.com now passes native validation and is normalised server-side; non-numeric NTN flagged on the field. Note: validated payloads are sent unchanged (raw body) so server transforms still apply as before |
| L-02 | pending | |
| L-03 | fixed | 2547821 — one allowlist: PAKISTAN_MOBILE_PREFIXES now lives in @jobbank/shared and pkMobileSchema refines against it (0399 rejected); web isSupportedPkMobile derives from the same list; PhoneInput free-text path now nulls e164 for unlisted prefixes like the segmented path; token domain fixed via the same schema. Drift-guard test added (dropdown table == shared list). Note: companyContactSchema still uses the broad 3xx regex (company contacts, not applicant mobiles) — out of this finding's scope |
| L-04 | pending | |
| L-05 | remaining | Needs deployment/scheduler decision (e.g. Vercel Cron + CRON_SECRET) |
| L-06 | pending | |
| L-07 | fixed | 3a80b40 — claimCompany now re-runs the conflict check inside the transaction (autoConflictCheck/assertNoConflictOfInterest take a DbExecutor, tx passed in-tx) |
| L-08 | fixed | 3a80b40 — resubmitOnboardedCompany + setOnboardedCompanyHeadOffice now 409 SELF_ATTESTATION when the actor onboarded the company; a colleague or Branch/Super Admin (who hold company:onboard) acts instead |
| L-09 | fixed | 8edffa5 — jobMachine FILL now allows PAUSED → FILLED, so a paused job whose last vacancy fills becomes FILLED instead of staying PAUSED with zero free vacancies |
| L-10 | decision-needed | Documented intent ("Missing optional data is NEUTRAL"); do not change weights |
| L-11 | pending | |
| L-12 | pending | |
| L-13 | pending | |
| L-14 | pending | |
| L-15 | pending | |
| L-16 | pending | |
| L-17 | decision-needed | Documented deliberate fail-open behaviour; accept, do not change |
| L-18 | decision-needed | Standard practice; do not change |
| L-19 | pending | |
| L-20 | pending | |
| L-21 | pending | |
| L-22 | decision-needed | Document-vs-fix decision: identity verification STAFF-only |
| L-23 | pending | |
| L-24 | pending | |
| L-25 | pending | |
| L-26 | decision-needed | Product decision: should suspension freeze job edits? |
| L-27 | pending | |
| L-28 | pending | |
| L-29 | fixed | 3a1f066 — resend route idempotent: true + client key; inviteStaff/resendInvitation rate-limited 5 per actor+target per hour; resendInvitation rejects within 5 min of the last live invite (cooldown via pendingInvitation.createdAt) |
| L-30 | pending | |
| L-31 | pending | |
| L-32 | pending | |
| L-33 | pending | |
| L-34 | fixed | 2547821 — nested it() in CompanyWizard.test.tsx moved out to describe level (now 11 tests, all passing); test fixture branch id changed to a real UUID so the new Location-step client validation passes |
| L-35 | pending | |
| L-36 | pending | Documentation only: build-time env / SKIP_ENV_VALIDATION=1 in README/CI docs |
| L-37 | pending | |

## Final verification

(To be filled after all fixable items: typecheck, lint, unit counts, build exit. Integration/E2E not run — no live DB.)

## Laptop steps remaining

- M-32: migration renumber + `pnpm db:generate` (backed up, coordinated).
- H-03: run `act-for-employer.integration.test.ts` on the laptop.
- Integration tests, API jest suite, E2E, matching pytest, `db:migrate` 0001–0045 on real Postgres.
- Live browser checks: verifier cross-city error page, print-to-PDF, token slip, mobile rendering.
