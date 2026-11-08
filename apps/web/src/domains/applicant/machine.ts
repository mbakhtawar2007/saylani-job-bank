import {
  APPLICANT_STATUSES,
  type ApplicantStatus,
  type ProfileSectionId,
  type Role,
} from '@jobbank/shared';
import { defineMachine } from '@/domains/shared/state-machine';

export type ApplicantEvent = 'ACTIVATE' | 'DEACTIVATE' | 'REACTIVATE' | 'RESTRICT' | 'DEMOTE';

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
 * Applicant profile lifecycle: DRAFT → ACTIVE (automatically, once personal details, the
 * location pin + branch and the required documents are in) ⇄ INACTIVE. RESTRICTED is set by
 * the blacklist module (M14): admins restrict a profile from any non-restricted state and
 * lift it back with REACTIVATE (completeness re-checked) or move it to INACTIVE. DEMOTE is
 * the system's own transition: refreshProfileState sends an ACTIVE profile back to DRAFT
 * when its completeness regresses (M31).
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
      from: 'DRAFT',
      event: 'ACTIVATE',
      to: 'ACTIVE',
      guard: ({ activationMissing }) =>
        activationMissing.length === 0 ||
        `Complete your ${activationMissing.map((id) => SECTION_NAMES[id]).join(', ')} first`,
    },
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
      from: ['DRAFT', 'ACTIVE', 'INACTIVE'],
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
    {
      from: 'ACTIVE',
      event: 'DEMOTE',
      to: 'DRAFT',
      // No actors: only the system fires this, from refreshProfileState, when
      // an ACTIVE profile's completeness regresses (M31).
    },
  ],
});
