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
  getEmployerReferralStats,
  hasVisibleEmployerJobs,
  listJobReferrals,
  listJobsForEmployer,
  listReferralTargets,
  referJobSchema,
  referJobToEmployer,
  type EmployerJobListItem,
  type EmployerReferralStats,
  type JobReferralView,
  type ReferJobInput,
  type ReferralTarget,
} from './referrals';
