/** Jobs domain (M8): posting, status transitions, staff board. */

export { expirePastCloseJobs, msUntilNextExpiryRun } from './expiry';
export { jobMachine, allowedTransitions, type JobStatusTransition } from './machine';
export {
  assertJobLive,
  assertJobOpen,
  assertVacancyAvailable,
  loadJob,
  loadJobForUpdate,
  type GuardedJob,
} from './status-guard';
export {
  createJob,
  deleteJob,
  getMyJob,
  listMyJobs,
  saveJobRequirements,
  saveJobSkills,
  setJobLocation,
  transitionJobStatus,
  updateJob,
} from './profile';
export type { JobLocationView, JobRequirementsView, JobSkillView, JobView } from './repository';
export { jobEditability, type JobEditability } from './rules';
export {
  forceCloseJob,
  getCompanyJobDetail,
  getJobDetail,
  isPureEmployer,
  JOB_SORTABLE,
  jobFilters,
  listJobs,
  listCompanyJobs,
  staffCreateJob,
  staffChangeJobStatus,
  staffUpdateJob,
  type JobListItem,
} from './staff';
export {
  countEmployerCandidates,
  countHiresByMonth,
  getEmployerJob,
  hasVisibleEmployerJobs,
  listJobsForEmployer,
  pktYearMonth,
  type HireEvent,
} from './employer';
export {
  isReferrableApplicant,
  listJobApplicantReferrals,
  listReferrableApplicants,
  listReferredJobsForApplicant,
  referJobToApplicant,
  referJobToApplicantSchema,
  type JobApplicantReferralView,
  type ReferJobToApplicantInput,
  type ReferrableApplicant,
  type ReferredJobView,
} from './applicant-referrals';
