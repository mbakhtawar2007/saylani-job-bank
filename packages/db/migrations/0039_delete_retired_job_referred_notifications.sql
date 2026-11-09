-- 0039: delete notifications of the retired JOB_REFERRED type (user decision 2026-11-09).
-- The job-to-employer referral flow was removed on 2026-11-08 (migration 0034
-- dropped job_referrals; commit 065ad87 removed JOB_REFERRED from the
-- notification type union), but its notification rows were never deleted, so
-- employers still saw a "New job referred" card for a feature that no longer
-- exists. Only this retired type is deleted: JOB_REFERRED_TO_APPLICANT (the
-- live job-to-applicant referral, including the 9 Nov referral to Syed Shah
-- Meer Ali) and every other notification are untouched.
DELETE FROM "notifications" WHERE "type" = 'JOB_REFERRED';
