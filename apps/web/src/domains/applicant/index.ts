/** Applicant profiles, documents and identity checks (M6). */
import './events';

export {
  confirmMyDocument,
  listApplicantDocumentTypes,
  myDocumentLink,
  presignMyDocument,
  removeMyDocument,
  staffDocumentLink,
  type DocumentLink,
  type PresignedDocument,
} from './documents';
export { applicantMachine, type ApplicantEvent } from './machine';
export { monthlyApplicantCounts } from './monthlyCounts';
export {
  applicantProfileSchema,
  applicantStaffViewSchema,
  verifiedSignedResponseSchema,
} from './output';
export {
  getMyProfile,
  myBranchOptions,
  registerApplicant,
  saveMyCertifications,
  saveMyEducation,
  saveMyExperience,
  saveMyLanguages,
  saveMyPreferences,
  saveMySkills,
  setMyLocation,
  setMyStatus,
  updateMyPersonal,
} from './profile';
export type { ApplicantDocumentType, ApplicantDocumentView, ApplicantProfile } from './repository';
export {
  cancelApplicantToken,
  completeTokenForRegistration,
  issueApplicantToken,
  lookupApplicantTokens,
  type ApplicantTokenView,
  type IssueApplicantTokenResult,
} from './tokens';
export {
  APPLICANT_SORTABLE,
  applicantFilters,
  changeApplicantPhone,
  getApplicantForStaff,
  listApplicants,
  markApplicantRegistrationVerifiedSigned,
  staffRegisterApplicant,
  staffSetApplicantStatus,
  staffUpdateApplicant,
  transferApplicant,
  verifyApplicantIdentity,
  type ApplicantListItem,
  type ApplicantStaffView,
  type IdentityCheckView,
} from './staff';
