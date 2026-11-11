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
| M-06 | fixed | f1d10a7 — expired ISSUED tokens are auto-cancelled (audited, reason 'expired') and a fresh token issued, in the existing-token branch and the race-winner path; integration tests added (NOT run here — no live DB; laptop must run tokens.integration.test.ts) |
| M-07 | fixed | f1d10a7 — code lookup returns all days' tokens for the number (most recent first, limit 30); dialog shows each result's Pakistan issue date and refreshes the selected row by id; integration test added (NOT run here — laptop) |
| M-08 | fixed | f1d10a7 — Print hidden for cancelled/completed/expired tokens (explanatory note instead); slip shows a Status row (CANCELLED/COMPLETED/EXPIRED — not valid) for non-live tokens, valid slips unchanged |
| M-09 | fixed | 8edffa5 — scheduleInterview/updateInterviewStatus require live job (OPEN/PAUSED, pre-check + locked re-check); docstring corrected to Staff / Branch Admin |
| M-10 | fixed | 8edffa5 — recordEmployerDecision sets lastCallStatus: null, so a repeat HOLD re-appears in the call list |
| M-11 | fixed | 3a80b40 — legal correction clears registrationVerifiedSignedAt/By; verifyCompany blocks onboarded companies until a fresh mark-signed for the current round (signedAt >= round.submittedAt; resubmits reuse the round so INFO_REQUESTED flow is unaffected; employer self-registered companies exempt) |
| M-12 | fixed | 42110aa — REJECTED-identity applicants excluded from the matching pool (repository.py) and from the eligibility gate (eligibility.py, defence-in-depth); pytest test added, 37 passed |
| M-13 | decision-needed | Product decision: include INACTIVE applicants in matching pool, or document ACTIVE-only |
| M-14 | fixed | 42110aa — ported listMatchedJobsForStaff + MatchedJobsForReferralCard from the fork clone's uncommitted matched-jobs work (read-only; fork untouched). Staff applicant detail now shows the AI-ranked list with refer buttons, VERIFIED-company + city-scope guards, already-referred flags |
| M-15 | fixed (partial) | 930e9db — new COMPANY_VERIFIED / COMPANY_REJECTED / COMPANY_INFO_REQUESTED types in KNOWN_NOTIFICATION_TYPES, plus a notifyCompanyOutcome helper (company/notify.ts) that fans out to employer members AND the staff onboarder (companyOnboarding.onboardedBy, deduplicated; self-registered employers are already members). verifyCompany / rejectCompany / requestCompanyInfo in verifier.ts now send the in-app notification post-commit, best-effort, alongside the emails, following the suspend pattern. The second-admin-approval part of this finding is decision-needed (see below) |
| M-16 | fixed | 42110aa — OFFER_EXTENDED notification type introduced for the employer-extending-an-offer direction (recordEmployerDecision); OFFER_ACCEPTED kept only for the applicant-accept direction. (Note: the brief's "M-16 (2FA reset)" is the audit's M-28 — see M-28. The MATCH_REJECTED reuse noted in M-16 is lower concern and left as is) |
| M-17 | fixed | 851fb27 — all 6 `if (ctx.ip)` skips routed through enforceRateLimitByIp (signup-code-ip, signup-ip, 2fa-confirm-ip, invite-accept-ip, password-reset-ip, password-reset-confirm-ip); null IP now lands in the shared 'untrusted' bucket |
| M-18 | fixed (partial) | 851fb27 — enforceRateLimitByIp logs an error in production when no trustworthy IP is known (proxy misconfiguration signal). Outright rejection + TRUSTED_PROXY_HOPS health check remain deployment decisions (see note in code) |
| M-19 | fixed | 851fb27 — absolute 7-day session lifetime enforced in getAuthState (sessions older than SESSION_TTL_SECONDS from creation are anonymous, however recently used); sliding window unchanged inside the 7 days; rememberMe left as is |
| M-20 | remaining | Phase 4 work — CSP nonces need per-request middleware + layout nonce plumbing; a mistake breaks all scripts/styles at runtime and cannot be verified without a live browser here. Do NOT attempt blind; plan: middleware nonce, layout theme script nonce, drop unsafe-inline/unsafe-eval |
| M-21 | fixed | 31f325c — two-step OTP flow reusing the existing auth OTP infra (issueOtp/verifyOtpCode, now exported from domains/auth): POST /api/v1/applicants/[id]/phone/code texts a 6-digit code to the NEW number (free-number pre-check + 5/hr per actor+applicant rate limit), and PUT /phone now requires the code in changePhoneSchema — verifyOtpCode consumes it exactly once, wrong/expired/locked codes reject with a field error on 'code', and phoneNumberVerified is true only because the number proved itself. Session revocation and the audit entry are unchanged; the ChangePhoneDialog is now two-step (send code → enter code → change). NOT verified live: SMS delivery + the end-to-end code flow need the laptop (no live SMS/DB in the VM) |
| M-22 | fixed | 3a1f066 — idempotent: true on POST /api/v1/applicants; dialog now sends an Idempotency-Key |
| M-23 | fixed | d1ff092 — one rule, documented in code: READS are city-scoped, branch-bound WRITES stay exact-branch. Applied: createApplicantRegistrationForm now passes scope 'city' to ensureApplicantVerificationToken (parameterised; the rotate-credential route keeps exact-branch), applicant staffDocumentLink uses assertCityAccess. Deliberately unchanged: token issue/lookup/cancel/complete (branch operations — tokens are per-branch-per-day), markApplicantRegistrationVerifiedSigned and staffUpdateApplicant's in-tx check (attestation/edit writes stay with the owning branch) |
| M-24 | fixed | 3a80b40 — markApplicantRegistrationVerifiedSigned now 409s SELF_ATTESTATION when row.counterRegisteredBy is the actor, mirroring the company path |
| M-25 | fixed | 44d2798 — employer merged-value checks extracted into shared helpers in domains/job/rules.ts (assertMergedJobUpdateValid: merged salary order, future closesAt, vacancies >= filled; assertJobUpdateReferencesValid: active category + designation salary range; mergedMedicalCoverage: OPD/IPD cover re-derivation; assertDesignationSalaryRange moved there from profile.ts) and called by BOTH updateJob and staffUpdateJob; new isCheckViolation (pg 23514) in shared/errors + mapJobCheckViolation maps the six jobs check constraints to 422s on the guarding field, so a race (e.g. a vacancy filling mid-update) is a ValidationError, not a 500 |
| M-26 | fixed | 3a1f066 — idempotent: true on POST /jobs/me + POST /companies/me/sites; JobWizard create sends a key. Found while fixing: StaffPostJobForm posted to the already-idempotent POST /jobs with NO key, so every staff job post 400d — key added there too |
| M-27 | fixed | a32708f — C-F2 guards mirrored: pure-applicant denial + pure-employer own-company forcing in listJobApplicantReferrals, getCompanyJobDetail, listCompanyJobs; loadJobForActor now uses isPureEmployer (exported from domains/job/staff) instead of the bare EMPLOYER role check |
| M-28 | fixed (partial) | 8a540ba — victim notification implemented: resetStaffTwoFactor now sends the affected user a TWO_FACTOR_RESET in-app notification (new type in KNOWN_NOTIFICATION_TYPES) plus a twoFactorResetEmail, post-commit and best-effort, naming the reason and telling them to contact their branch admin if they did not ask for it. DECISION-NEEDED: the second-admin-approval (or acting-admin password re-entry) part — needs a design decision (approval workflow vs re-auth); the single-admin reset with an audited reason remains until then |
| M-29 | fixed | a7f2611 — added apps/web/src/app/(dashboard)/error.tsx (client error boundary, EmptyState + Try again + home link, matching the 404/forbidden page language) and caught ScopeViolationError in the verifier, branch-admin and staff job-detail pages, redirecting to /forbidden instead of the default Next.js error screen |
| M-30 | fixed | 8897097 — the rich rendering was extracted from branch-admin/jobs/[id]/page.tsx into a shared JobDetailView (_components/jobs/JobDetailView.tsx) and both that page and the company-job page now render it; BranchJobDetail.tsx deleted. City codes are now resolved via masterDataLabels (CITY added to the labels fetch — the rich page itself rendered raw cityCode); Benefits & Perks and Timeline now show on the company-job route too, with a 'Back to {company}' link. The stray mid-file `import type React` in the old page is gone with the extraction |
| M-31 | fixed | a7f2611 — StaffCompanyPanel now passes a role-appropriate jobLinkBasePath for every role that renders it (staff → /staff/jobs, verifier → /verifier/jobs, super-admin → /super-admin/jobs); branch-admin keeps the company-job route. Job rows are links again instead of plain text |
| M-32 | laptop-step | LAPTOP-ONLY, coordinated: renumber 0014/0015 + regenerate 22 missing snapshots. Do NOT hand-edit _journal.json |
| M-33 | fixed | 7aff2ad — dummy test-only BETTER_AUTH_SECRET (41 chars, 'unit-test-secret-…') added to the vitest unit project's env, mirroring the integration project's test secret; otp.test.ts now passes (3/3) on a clean checkout |
| M-34 | fixed | 7aff2ad — seed-coverage test exempts DESIGNATION (intentionally unseeded; user supplies the list/ranges). No invented designations seeded; packages/db seed test 4/4 passes |

## Low

| ID | Status | Commit / note |
|----|--------|---------------|
| L-01 | fixed | 2547821 — CompanyWizard: noValidate on all three step forms; Details/Contacts/Location validate client-side against register/updateCompany, companyContacts and companyHeadOffice schemas with FormErrorSummary + focus + per-field errors; bare acme.com now passes native validation and is normalised server-side; non-numeric NTN flagged on the field. Note: validated payloads are sent unchanged (raw body) so server transforms still apply as before |
| L-02 | fixed | 7aff2ad — token-route POST comment now says CNIC + name + phone, matching issueApplicantTokenSchema and the dialog |
| L-03 | fixed | 2547821 — one allowlist: PAKISTAN_MOBILE_PREFIXES now lives in @jobbank/shared and pkMobileSchema refines against it (0399 rejected); web isSupportedPkMobile derives from the same list; PhoneInput free-text path now nulls e164 for unlisted prefixes like the segmented path; token domain fixed via the same schema. Drift-guard test added (dropdown table == shared list). Note: companyContactSchema still uses the broad 3xx regex (company contacts, not applicant mobiles) — out of this finding's scope |
| L-04 | fixed | 44d2798 — staffChangeJobStatus now runs the machine: new explicit ARCHIVE event (OPEN/PAUSED → CLOSED, actors STAFF/BA/SA/VERIFIER) in jobMachine; a never-published DRAFT can no longer be archived to CLOSED. FORCE_CLOSE was not reused because it excludes STAFF, who hold job:manage and archive from the job board |
| L-05 | remaining | Needs deployment/scheduler decision (e.g. Vercel Cron + CRON_SECRET) |
| L-06 | fixed | 7aff2ad — job→applicant referral error reworded to 'Only jobs from verified companies can be referred to applicants' |
| L-07 | fixed | 3a80b40 — claimCompany now re-runs the conflict check inside the transaction (autoConflictCheck/assertNoConflictOfInterest take a DbExecutor, tx passed in-tx) |
| L-08 | fixed | 3a80b40 — resubmitOnboardedCompany + setOnboardedCompanyHeadOffice now 409 SELF_ATTESTATION when the actor onboarded the company; a colleague or Branch/Super Admin (who hold company:onboard) acts instead |
| L-09 | fixed | 8edffa5 — jobMachine FILL now allows PAUSED → FILLED, so a paused job whose last vacancy fills becomes FILLED instead of staying PAUSED with zero free vacancies |
| L-10 | decision-needed | Documented intent ("Missing optional data is NEUTRAL"); do not change weights |
| L-11 | fixed | 42110aa — updateInterviewStatus now notifies INTERVIEW_RESCHEDULED (not "scheduled") when rescheduling an already-scheduled interview |
| L-12 | fixed | 42110aa — recordEmployerDecision now notifies the referring staff member (application createdBy, new REFERRAL_DECISION type), skipped when the decider is the referrer |
| L-13 | fixed | 851fb27 — production now blocks origin-less cookie-authenticated writes unless the x-internal-write-token service header matches INTERNAL_WRITE_TOKEN (new optional env); test/dev keep the lenient path with a warning |
| L-14 | fixed | 851fb27 — invite-accept + password-reset-confirm now have the same per-token 10/15m limit as invite lookup (SHA-256 hash of the presented token) |
| L-15 | fixed | 851fb27 — health cap 300→60/min/IP, result cached 5s, exposeErrors only in local dev (NODE_ENV === 'development') |
| L-16 | fixed | 851fb27 — per-email login bucket now counts only FAILED attempts (consumed in failed()); per-IP bucket still gates before verification; successes never spend the budget |
| L-17 | decision-needed | Documented deliberate fail-open behaviour; accept, do not change |
| L-18 | decision-needed | Standard practice; do not change |
| L-19 | fixed | COMMIT — documented in README 'Build-time environment': never set SKIP_ENV_VALIDATION in production; the deploy checklist must assert it is unset (it bypasses validation including the secret-length rule). secret.ts still throws at startup unless the auth secret exists and is >=32 chars |
| L-20 | fixed | 851fb27 — per-user rate limits on placement writes: shortlist 30/hr, refer-to-employer 30/hr (both paths share one bucket), refer-job-applicant 30/hr, employer-decision 30/hr, application-message 60/hr per sender+application, offer-response 10/hr per applicant |
| L-21 | fixed | 851fb27 — shortlistApplicant catches the unique violation and throws the specific 'already shortlisted' message; counter-register maps a concurrent phone collision (users_phoneNumber_unique / users_email_unique) to the specific PHONE_TAKEN message |
| L-22 | decision-needed | Document-vs-fix decision: identity verification STAFF-only |
| L-23 | fixed | a32708f — assertCityArea now called in registerApplicantForStaff and staffUpdateApplicantProfile (city must be active, area must belong to the city), matching staffRegisterApplicant and self-service setMyLocation |
| L-24 | fixed | a32708f — staffCompanyDocumentLink now asserts company:read and applies the getCompanyDetail non-manager status rule (DRAFT company docs, incl. CNIC images, closed to company:read holders; managers SA/BA/verifier unaffected); getCompanyOnboarding gets the same status check (its only callers are the company-detail pages, which already enforce it via getCompanyDetail) |
| L-25 | fixed | d1ff092 — same rule, companies side: listCompanies (branchScope → cityScope), getCompanyDetail, getCompanyOnboarding, staffCompanyDocumentLink, getCompanyJobDetail and listCompanyJobs (branch → city). A verifier now sees the company in their city queue AND can open its detail/jobs. Unchanged: suspend/reinstate/assign/transfer/mark-signed/resubmit/set-head-office/correct (writes stay exact-branch); the non-manager VERIFIED/SUSPENDED status rule and the staff-onboarder createdBy rule are untouched |
| L-26 | decision-needed | Product decision: should suspension freeze job edits? |
| L-27 | fixed | a32708f — same change as M-27: loadJobForActor uses isPureEmployer, so a dual STAFF+EMPLOYER user keeps staff's city-wide match review |
| L-28 | fixed | 851fb27 — SSE stream returns 403 when the actor is twoFactorPending, same gate as apiHandler |
| L-29 | fixed | 3a1f066 — resend route idempotent: true + client key; inviteStaff/resendInvitation rate-limited 5 per actor+target per hour; resendInvitation rejects within 5 min of the last live invite (cooldown via pendingInvitation.createdAt) |
| L-30 | fixed | 851fb27 — listHolidays now takes the actor and hides inactive rows unless includeInactive + master_data:manage (management page passes includeInactive); SSE cursor advances to the OLDEST returned item so >20-in-a-window notifications are no longer dropped (same-timestamp bulk edge noted in code) |
| L-31 | fixed | a32708f — new escapeLikePattern/likeContains/likeStartsWith helpers in domains/shared/filters.ts (backslash-escaping of %, _, \); applied to staff search in user.ts (name/email) and to the same unescaped pattern found in applicant search (name, city/area label), company search (legal/trade name, NTN prefix) and job search (title/description/category/company name) |
| L-32 | fixed | a32708f — deleteStaff pre-checks for an applicant profile and a company membership and throws a specific ConflictError naming the blocking link, instead of the generic FK 409 |
| L-33 | fixed (partial) | 7aff2ad — dead staffRegisterCompanySchema + StaffRegisterCompanyInput deleted (zero references). The two unused dialogs (RegisterApplicantDialog, ApplicantTokenLookupDialog) are KEPT, not deleted: the user's standing rule is 'delete only if user says so' — they exist for the future step-2 entry point |
| L-34 | fixed | 2547821 — nested it() in CompanyWizard.test.tsx moved out to describe level (now 11 tests, all passing); test fixture branch id changed to a real UUID so the new Location-step client validation passes |
| L-35 | fixed | 7aff2ad — empty apps/web/src/domains/decision/ and apps/web/src/domains/interview/ placeholder dirs removed (only .gitkeep, zero imports) |
| L-36 | fixed | COMMIT — README 'Build-time environment' section: lists the build-time env (DATABASE_URL, S3 keys, S3_BUCKET, NEXT_PUBLIC_APP_URL, BETTER_AUTH_SECRET >=32 chars), points at .env.example + CI, and documents SKIP_ENV_VALIDATION=1 for compile-only checks on a fresh checkout |
| L-37 | fixed | COMMIT — full eslint run is now 0 errors, 0 warnings (was 13): 3x console.log -> console.info (rule-allowed); 4x print/static logos -> next/image unoptimized (token slip x2, registration + company print forms, matching the existing QR/print precedent); 5x landing-page Unsplash photos -> next/image (fill for the absolute cover images, width/height for the flow ones) with images.remotePatterns for images.unsplash.com in next.config.ts; the CompanyWizard data-URL preview stays <img> with an eslint-disable + comment (client-side bytes, unknown dimensions, nothing to optimise). The 'Next.js plugin not detected' build warning is Next's legacy detection: @next/eslint-plugin-next IS configured in apps/web/eslint.config.js (recommended + core-web-vitals) — no change needed |

## Final verification

(To be filled after all fixable items: typecheck, lint, unit counts, build exit. Integration/E2E not run — no live DB.)

## Laptop steps remaining

- M-32: migration renumber + `pnpm db:generate` (backed up, coordinated).
- H-03: run `act-for-employer.integration.test.ts` on the laptop.
- Integration tests, API jest suite, E2E, matching pytest, `db:migrate` 0001–0045 on real Postgres.
- Live browser checks: verifier cross-city error page, print-to-PDF, token slip, mobile rendering.
