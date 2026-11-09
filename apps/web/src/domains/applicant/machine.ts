import {
  APPLICANT_STATUSES,
  type ApplicantStatus,
  type ProfileSectionId,
  type Role,
} from '@jobbank/shared';
import { defineMachine } from '@/domains/shared/state-machine';

export type ApplicantEvent = 'DEACTIVATE' | 'REACTIVATE' | 'RESTRICT';

export interface ApplicantMachineContext {
  /** Sections still blocking activation (from computeCompleteness). */
  activationMissing: readonly ProfileSectionId[];
}

const SECTION_NAMES: Record<ProfileSectionId, string> = {
  personal: 'personal details',
  location: 'home location and branch',
  skills: 'skills',
  education: 'education',
  experience: 'work experience',
  preferences: 'job preferences',
  documents: 'required documents (CNIC front and back)',
  languages: 'languages',
};

/**
 * Applicant profile lifecycle: ACTIVE ⇄ INACTIVE. There is no DRAFT state
 * (removed 2026-11-09, user decision): a profile is ACTIVE from creation,
 * even while personal details, the location pin + branch or the required
 * documents are still missing. Completeness only gates coming back from
 * INACTIVE/RESTRICTED via REACTIVATE. RESTRICTED is set by the blacklist
 * module (M14): admins restrict a profile from any non-restricted state and
 * lift it back with REACTIVATE (completeness re-checked) or move it to
 * INACTIVE.
 */
export const applicantMachine = defineMachine<
  ApplicantStatus,
  ApplicantEvent,
  ApplicantMachineContext,
  Role
>({
  name: 'applicant profile',
  states: APPLICANT_STATUSES,
  transitions: [
    {
      from: 'ACTIVE',
      event: 'DEACTIVATE',
      to: 'INACTIVE',
      actors: ['APPLICANT', 'STAFF', 'BRANCH_ADMIN', 'SUPER_ADMIN'],
    },
    {
      from: 'INACTIVE',
      event: 'REACTIVATE',
      to: 'ACTIVE',
      actors: ['APPLICANT', 'STAFF', 'BRANCH_ADMIN', 'SUPER_ADMIN'],
      // Same completeness guard as ACTIVATE: a profile whose CNIC documents or
      // location were deleted (or never completed) while it was inactive must
      // not come back as matchable. Callers must pass the real activationMissing
      // from completenessFor — passing [] here would silently skip the guard.
      guard: ({ activationMissing }) =>
        activationMissing.length === 0 ||
        `Complete your ${activationMissing.map((id) => SECTION_NAMES[id]).join(', ')} first`,
    },
    {
      from: ['ACTIVE', 'INACTIVE'],
      event: 'RESTRICT',
      to: 'RESTRICTED',
      actors: ['BRANCH_ADMIN', 'SUPER_ADMIN'],
    },
    {
      from: 'RESTRICTED',
      event: 'REACTIVATE',
      to: 'ACTIVE',
      // Lifting a restriction is an admin act: the applicant cannot lift it
      // themselves. Same completeness guard as the INACTIVE path.
      actors: ['BRANCH_ADMIN', 'SUPER_ADMIN'],
      guard: ({ activationMissing }) =>
        activationMissing.length === 0 ||
        `Complete your ${activationMissing.map((id) => SECTION_NAMES[id]).join(', ')} first`,
    },
    {
      from: 'RESTRICTED',
      event: 'DEACTIVATE',
      to: 'INACTIVE',
      actors: ['BRANCH_ADMIN', 'SUPER_ADMIN'],
    },
  ],
});
