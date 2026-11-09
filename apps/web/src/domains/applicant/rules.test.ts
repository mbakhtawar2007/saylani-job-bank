import {
  ageOn,
  certificationsSchema,
  computeCompleteness,
  educationSchema,
  experienceSchema,
  identityVerificationSchema,
  karachiDay,
  pkMobileSchema,
  pkPhoneSchema,
  preferencesSchema,
  registerApplicantSchema,
  updatePersonalSchema,
  type ProfileFacts,
} from '@jobbank/shared';
import { describe, expect, it } from 'vitest';
import { applicantMachine } from './machine';

const empty: ProfileFacts = {
  hasPersonal: true,
  hasLocation: false,
  skillCount: 0,
  educationCount: 0,
  experienceCount: 0,
  hasNoExperience: false,
  hasPreferences: false,
  missingRequiredDocuments: 2,
  languageCount: 0,
};

describe('profile completeness', () => {
  it('weights the sections to 100%', () => {
    expect(computeCompleteness(empty).percent).toBe(20);
    expect(
      computeCompleteness({
        hasPersonal: true,
        hasLocation: true,
        skillCount: 2,
        educationCount: 1,
        experienceCount: 1,
        hasNoExperience: false,
        hasPreferences: true,
        missingRequiredDocuments: 0,
        languageCount: 1,
      }).percent,
    ).toBe(100);
  });

  it('counts "no work experience" as a completed experience section', () => {
    const result = computeCompleteness({ ...empty, hasNoExperience: true });
    expect(result.sections.find((s) => s.id === 'experience')?.done).toBe(true);
    expect(result.percent).toBe(30);
  });

  it('needs personal details, location and required documents to activate', () => {
    expect(computeCompleteness(empty).activationMissing).toEqual(['location', 'documents']);
    expect(
      computeCompleteness({ ...empty, hasLocation: true, missingRequiredDocuments: 0 })
        .activationMissing,
    ).toEqual([]);
  });
});

describe('applicant status machine', () => {
  it('has no DRAFT state and no ACTIVATE transition: profiles are ACTIVE from creation (removed 2026-11-09)', () => {
    expect(applicantMachine.states).toEqual(['ACTIVE', 'INACTIVE', 'RESTRICTED']);
    expect(
      applicantMachine.availableEvents('ACTIVE', { activationMissing: [] }, ['APPLICANT']),
    ).toEqual(['DEACTIVATE']);
    expect(
      applicantMachine.availableEvents('INACTIVE', { activationMissing: [] }, ['APPLICANT']),
    ).toEqual(['REACTIVATE']);
  });

  it('lets the applicant or staff pause and resume, but not employers or the system', () => {
    const ctx = { activationMissing: [] };
    expect(applicantMachine.transition('ACTIVE', 'DEACTIVATE', ctx, ['APPLICANT'])).toBe(
      'INACTIVE',
    );
    expect(applicantMachine.transition('INACTIVE', 'REACTIVATE', ctx, ['STAFF'])).toBe('ACTIVE');
    expect(applicantMachine.check('ACTIVE', 'DEACTIVATE', ctx, ['EMPLOYER']).ok).toBe(false);
    expect(applicantMachine.check('ACTIVE', 'DEACTIVATE', ctx, 'system').ok).toBe(false);
  });

  it('restricts from ACTIVE or INACTIVE, and only admins lift it (M31)', () => {
    const ctx = { activationMissing: [] };
    expect(applicantMachine.transition('ACTIVE', 'RESTRICT', ctx, ['BRANCH_ADMIN'])).toBe(
      'RESTRICTED',
    );
    expect(applicantMachine.transition('INACTIVE', 'RESTRICT', ctx, ['SUPER_ADMIN'])).toBe(
      'RESTRICTED',
    );
    expect(applicantMachine.check('RESTRICTED', 'RESTRICT', ctx, ['STAFF']).ok).toBe(false);
    // The applicant cannot lift their own restriction; staff cannot either.
    expect(applicantMachine.check('RESTRICTED', 'REACTIVATE', ctx, ['APPLICANT']).ok).toBe(false);
    expect(applicantMachine.check('RESTRICTED', 'REACTIVATE', ctx, ['STAFF']).ok).toBe(false);
    expect(applicantMachine.transition('RESTRICTED', 'REACTIVATE', ctx, ['BRANCH_ADMIN'])).toBe(
      'ACTIVE',
    );
    // …but not while the profile is incomplete.
    expect(
      applicantMachine.check('RESTRICTED', 'REACTIVATE', { activationMissing: ['documents'] }, [
        'SUPER_ADMIN',
      ]).ok,
    ).toBe(false);
    expect(applicantMachine.transition('RESTRICTED', 'DEACTIVATE', ctx, ['SUPER_ADMIN'])).toBe(
      'INACTIVE',
    );
  });

  it('lets a Super Admin pause and resume profiles (H20)', () => {
    const ctx = { activationMissing: [] };
    expect(applicantMachine.transition('ACTIVE', 'DEACTIVATE', ctx, ['SUPER_ADMIN'])).toBe(
      'INACTIVE',
    );
    expect(applicantMachine.transition('INACTIVE', 'REACTIVATE', ctx, ['SUPER_ADMIN'])).toBe(
      'ACTIVE',
    );
  });

  it('has no DEMOTE transition: losing completeness no longer sends a profile back (removed 2026-11-09)', () => {
    const ctx = { activationMissing: ['documents' as const] };
    expect(applicantMachine.availableEvents('ACTIVE', ctx, 'system')).toEqual([]);
    expect(applicantMachine.availableEvents('ACTIVE', ctx, ['SUPER_ADMIN'])).toEqual([
      'DEACTIVATE',
      'RESTRICT',
    ]);
  });
});

describe('registration rules', () => {
  const valid = {
    fullName: 'Muhammad Ali',
    fatherName: 'Abdul Rehman',
    cnic: '42101-1234567-1',
    dateOfBirth: '1999-06-30',
    gender: 'MALE',
  };

  it('normalises the CNIC to 13 digits and treats an empty email as none', () => {
    expect(registerApplicantSchema.parse({ ...valid, email: '' })).toMatchObject({
      cnic: '4210112345671',
      email: null,
    });
  });

  it('accepts Urdu names and rejects digits in names', () => {
    expect(registerApplicantSchema.safeParse({ ...valid, fullName: 'محمد علی' }).success).toBe(
      true,
    );
    expect(registerApplicantSchema.safeParse({ ...valid, fullName: 'Ali 2' }).success).toBe(false);
  });

  it('requires applicants to be at least 18', () => {
    const today = new Date('2026-10-02T12:00:00Z');
    expect(ageOn('2008-10-02', today)).toBe(18);
    expect(ageOn('2008-10-03', today)).toBe(17);
    const seventeen = new Date();
    seventeen.setUTCFullYear(seventeen.getUTCFullYear() - 17);
    expect(
      registerApplicantSchema.safeParse({
        ...valid,
        dateOfBirth: seventeen.toISOString().slice(0, 10),
      }).success,
    ).toBe(false);
  });

  it('never fills defaults into a partial update', () => {
    expect(updatePersonalSchema.parse({ email: 'a@b.pk' })).toEqual({ email: 'a@b.pk' });
  });
});

describe('section rules', () => {
  const job = { employerName: 'Hashoo Foods', jobTitle: 'Packer', startMonth: '2021-03' };

  it('needs an end month unless the job is current, and never an end before the start', () => {
    expect(experienceSchema.safeParse({ hasNoExperience: false, items: [job] }).success).toBe(
      false,
    );
    expect(
      experienceSchema.safeParse({
        hasNoExperience: false,
        items: [{ ...job, isCurrent: true }],
      }).success,
    ).toBe(true);
    expect(
      experienceSchema.safeParse({
        hasNoExperience: false,
        items: [{ ...job, endMonth: '2020-01' }],
      }).success,
    ).toBe(false);
  });

  it('rejects duplicate categories in preferences', () => {
    const base = { categoryCodes: ['DRIVING'], shifts: [], jobTypes: [] };
    expect(
      preferencesSchema.safeParse({ ...base, categoryCodes: ['DRIVING', 'DRIVING'] }).success,
    ).toBe(false);
  });

  it('needs a note when an identity check fails', () => {
    expect(
      identityVerificationSchema.safeParse({ outcome: 'REJECTED', method: 'DOCUMENT_REVIEW' })
        .success,
    ).toBe(false);
    expect(
      identityVerificationSchema.safeParse({ outcome: 'VERIFIED', method: 'IN_PERSON' }).success,
    ).toBe(true);
  });

  it('rejects a future completion year unless the education is current (L13)', () => {
    const nextYear = new Date().getUTCFullYear() + 1;
    const item = { levelCode: 'BACHELORS', completionYear: nextYear, isCurrent: false };
    expect(educationSchema.safeParse({ items: [item] }).success).toBe(false);
    expect(educationSchema.safeParse({ items: [{ ...item, isCurrent: true }] }).success).toBe(true);
    expect(
      educationSchema.safeParse({
        items: [{ ...item, completionYear: new Date().getUTCFullYear() }],
      }).success,
    ).toBe(true);
  });

  it('rejects a certification issued in the future (L13)', () => {
    const now = new Date();
    const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
      .toISOString()
      .slice(0, 7);
    expect(
      certificationsSchema.safeParse({ items: [{ name: 'First Aid', issuedMonth: nextMonth }] })
        .success,
    ).toBe(false);
    expect(
      certificationsSchema.safeParse({
        items: [{ name: 'First Aid', issuedMonth: now.toISOString().slice(0, 7) }],
      }).success,
    ).toBe(true);
  });

  it('rejects a past available-from date (L15)', () => {
    const base = { categoryCodes: ['DRIVING'], shifts: [], jobTypes: [] };
    const yesterday = karachiDay(new Date(Date.now() - 86_400_000));
    expect(preferencesSchema.safeParse({ ...base, availableFrom: yesterday }).success).toBe(false);
    expect(preferencesSchema.safeParse({ ...base, availableFrom: karachiDay() }).success).toBe(
      true,
    );
  });
});

describe('phone schemas (M21)', () => {
  it('accepts a 03xx mobile in both schemas', () => {
    expect(pkPhoneSchema.parse('0300 1234567')).toBe('+923001234567');
    expect(pkMobileSchema.parse('0300 1234567')).toBe('+923001234567');
    expect(pkMobileSchema.parse('+92 300 1234567')).toBe('+923001234567');
  });

  it('accepts a landline only in the landline-tolerant schema', () => {
    expect(pkPhoneSchema.parse('021 34567890')).toBe('+922134567890');
    expect(pkMobileSchema.safeParse('021 34567890').success).toBe(false);
    expect(pkMobileSchema.safeParse('0213456789').success).toBe(false);
  });
});
