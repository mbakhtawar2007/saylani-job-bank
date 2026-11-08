/** Jobs domain (M8): posting, status transitions, staff board. */

export { expirePastCloseJobs } from './expiry';
export { jobMachine } from './machine';
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
export {
  allowedTransitions,
  EMPLOYER_OPEN_JOB_FIELDS,
  EMPLOYER_OPEN_REQUIREMENTS_FIELDS,
  EMPLOYER_RESTRICTED_JOB_FIELDS,
  EMPLOYER_RESTRICTED_REQUIREMENTS_FIELDS,
  employerMayEditJobSubResource,
  employerRestrictedRequirementsFields,
  employerRestrictedUpdateFields,
  isEmployerRestrictedJobStatus,
  jobEditability,
  type JobEditability,
  type JobStatusTransition,
} from './rules';
export {
  forceCloseJob,
  getJobDetail,
  JOB_SORTABLE,
  jobFilters,
  listJobs,
  staffCreateJob,
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
