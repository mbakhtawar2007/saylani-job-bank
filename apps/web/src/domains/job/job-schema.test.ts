import { describe, expect, it } from 'vitest';
import {
  createJobSchema,
  deriveMedicalCoverage,
  experienceLevelToMinYears,
  jobLocationSchema,
  jobRequirementsSchema,
  jobSkillsSchema,
  type Role,
  updateJobSchema,
} from '@jobbank/shared';
import { jobMachine } from './machine';
import {
  EMPLOYER_OPEN_JOB_FIELDS,
  EMPLOYER_RESTRICTED_JOB_FIELDS,
  EMPLOYER_RESTRICTED_REQUIREMENTS_FIELDS,
  employerMayEditJobSubResource,
  employerRestrictedRequirementsFields,
  employerRestrictedUpdateFields,
  isEmployerRestrictedJobStatus,
} from './rules';

// Regression test for the H9 finding: updateJobSchema used to be
// createJobSchema.partial(), and zod defaults survive .partial() — so a
// PATCH that only changed the title silently reset gender preference and
// every benefit/perk field to its default.
describe('job schemas', () => {
  const validCreate = {
    title: 'Driver',
    categoryCode: 'TRANSPORT',
    description: 'Drives the delivery van.',
    jobType: 'FULL_TIME',
    shift: 'ROTATING',
    shiftHours: 8,
    vacancies: 2,
  } as const;
  it('a partial update carries only the fields the caller sent', () => {
    const parsed = updateJobSchema.parse({ title: 'New title' });
    expect(parsed).toEqual({ title: 'New title' });
    expect('genderPreference' in parsed).toBe(false);
    expect('fuelAllowance' in parsed).toBe(false);
    expect('medicalCoverage' in parsed).toBe(false);
    expect('workFromHome' in parsed).toBe(false);
  });

  it('an explicit benefit value still passes through an update', () => {
    expect(
      updateJobSchema.parse({ fuelAllowance: true, medicalCoverage: 'COMPREHENSIVE' }),
    ).toEqual({
      fuelAllowance: true,
      medicalCoverage: 'COMPREHENSIVE',
    });
  });

  it('create still fills defaults for omitted fields', () => {
    const parsed = createJobSchema.parse({
      title: 'Driver',
      categoryCode: 'TRANSPORT',
      description: 'Drives the delivery van.',
      jobType: 'FULL_TIME',
      shift: 'ROTATING',
      shiftHours: 8,
      vacancies: 2,
    });
    expect(parsed.genderPreference).toBe('ANY');
    expect(parsed.fuelAllowance).toBe(false);
    expect(parsed.medicalCoverage).toBe('NONE');
    // Standard leave entitlement (2026-11-10): Annual 14 / Sick 10 / Casual 10.
    expect(parsed.annualLeaveDays).toBe(14);
    expect(parsed.sickLeaveDays).toBe(10);
    expect(parsed.casualLeaveDays).toBe(10);
  });

  // Job posting form fields (2026-11-10).
  it('create rejects a salary below the PKR 41,700 minimum', () => {
    expect(createJobSchema.safeParse({ ...validCreate, salaryMin: 41_699 }).success).toBe(false);
    expect(createJobSchema.safeParse({ ...validCreate, salaryMin: 41_700 }).success).toBe(true);
    expect(createJobSchema.safeParse({ ...validCreate, salaryMax: 40_000 }).success).toBe(false);
  });

  it('create rejects a non-rotating shift', () => {
    expect(createJobSchema.safeParse({ ...validCreate, shift: 'DAY' }).success).toBe(false);
    expect(createJobSchema.safeParse({ ...validCreate, shift: 'NIGHT' }).success).toBe(false);
  });

  it('create requires shift hours', () => {
    const { shiftHours: _omitted, ...withoutHours } = validCreate;
    expect(createJobSchema.safeParse(withoutHours).success).toBe(false);
    expect(createJobSchema.safeParse({ ...validCreate, shiftHours: 0 }).success).toBe(false);
    expect(createJobSchema.safeParse({ ...validCreate, shiftHours: 25 }).success).toBe(false);
    expect(createJobSchema.safeParse({ ...validCreate, shiftHours: 12 }).success).toBe(true);
  });

  it('create requires a bonus basis when a bonus tier is set', () => {
    expect(createJobSchema.safeParse({ ...validCreate, bonusTier: 'TIER_1' }).success).toBe(false);
    expect(
      createJobSchema.safeParse({
        ...validCreate,
        bonusTier: 'TIER_1',
        bonusBasis: 'GROSS',
      }).success,
    ).toBe(true);
    expect(createJobSchema.safeParse({ ...validCreate, bonusBasis: 'BASIC' }).success).toBe(false);
  });

  it('experience bands map to whole years for matching', () => {
    expect(experienceLevelToMinYears('FRESHER')).toBe(0);
    expect(experienceLevelToMinYears('BEGINNER')).toBe(0);
    expect(experienceLevelToMinYears('INTERMEDIATE')).toBe(1);
    expect(experienceLevelToMinYears('EXPERT')).toBe(3);
  });

  it('requirements reject months outside the chosen experience band', () => {
    expect(
      jobRequirementsSchema.safeParse({ experienceLevel: 'BEGINNER', minExperienceMonths: 12 })
        .success,
    ).toBe(false);
    expect(
      jobRequirementsSchema.safeParse({ experienceLevel: 'BEGINNER', minExperienceMonths: 6 })
        .success,
    ).toBe(true);
    expect(
      jobRequirementsSchema.safeParse({ experienceLevel: 'FRESHER', minExperienceMonths: 3 })
        .success,
    ).toBe(false);
  });

  it('requirements only allow English and Urdu', () => {
    expect(jobRequirementsSchema.safeParse({ languageCodes: ['URDU', 'ENGLISH'] }).success).toBe(
      true,
    );
    expect(jobRequirementsSchema.safeParse({ languageCodes: ['SINDHI'] }).success).toBe(false);
    expect(jobRequirementsSchema.safeParse({ languageCodes: ['ARABIC'] }).success).toBe(false);
  });

  it('medical cover is derived from the OPD / IPD limits', () => {
    expect(deriveMedicalCoverage(undefined, undefined)).toBe('NONE');
    expect(deriveMedicalCoverage(50_000, undefined)).toBe('BASIC');
    expect(deriveMedicalCoverage(undefined, 200_000)).toBe('BASIC');
    expect(deriveMedicalCoverage(50_000, 200_000)).toBe('COMPREHENSIVE');
  });

  // C4/M16: salary range and closing date guards on create.
  it('create rejects an inverted salary range', () => {
    const result = createJobSchema.safeParse({
      ...validCreate,
      salaryMin: 100_000,
      salaryMax: 50_000,
    });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.path).toEqual(['salaryMin']);
  });

  it('create rejects a salary above the 10,000,000 cap', () => {
    expect(createJobSchema.safeParse({ ...validCreate, salaryMin: 10_000_001 }).success).toBe(
      false,
    );
    expect(createJobSchema.safeParse({ ...validCreate, salaryMax: 10_000_000 }).success).toBe(true);
  });

  it('create rejects a closing date in the past', () => {
    const result = createJobSchema.safeParse({
      ...validCreate,
      closesAt: '2020-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(false);
    expect(result.error!.issues[0]!.path).toEqual(['closesAt']);
  });

  it('create accepts a future closing date and an equal salary range', () => {
    expect(
      createJobSchema.safeParse({
        ...validCreate,
        salaryMin: 50_000,
        salaryMax: 50_000,
        closesAt: '2999-01-01T00:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  // M16: the field-level cap also applies to PATCH (the merged-range check
  // lives in updateJob, which needs a stored row, so it is not unit-tested
  // here).
  it('update rejects a salary above the 10,000,000 cap', () => {
    expect(updateJobSchema.safeParse({ salaryMin: 10_000_001 }).success).toBe(false);
    expect(updateJobSchema.safeParse({ salaryMax: 10_000_000 }).success).toBe(true);
  });

  // C5: a location update must carry something to save.
  it('location rejects an empty body', () => {
    expect(jobLocationSchema.safeParse({}).success).toBe(false);
  });

  it('location rejects an address without a pin', () => {
    const result = jobLocationSchema.safeParse({
      addressLine: '123 Main Street',
      cityCode: 'KARACHI',
    });
    expect(result.success).toBe(false);
  });

  it('location accepts a saved company location on its own', () => {
    expect(
      jobLocationSchema.safeParse({
        companyLocationId: '00000000-0000-4000-8000-000000000000',
      }).success,
    ).toBe(true);
  });

  it('location accepts a full ad-hoc address with a pin in Pakistan', () => {
    expect(
      jobLocationSchema.safeParse({
        addressLine: '123 Main Street',
        cityCode: 'KARACHI',
        location: { lat: 24.8607, lng: 67.0011 },
      }).success,
    ).toBe(true);
  });

  it('location rejects a pin outside Pakistan', () => {
    // London — in range for lat/lng, outside the Pakistan bounds.
    const result = jobLocationSchema.safeParse({
      addressLine: '10 Downing Street',
      cityCode: 'KARACHI',
      location: { lat: 51.5034, lng: -0.1276 },
    });
    expect(result.success).toBe(false);
  });

  // L15: duplicate skill codes are rejected, like applicant skills.
  it('job skills reject a duplicate skillCode', () => {
    const result = jobSkillsSchema.safeParse({
      skills: [
        { skillCode: 'DRIVING', required: true, minLevel: 'BEGINNER' },
        { skillCode: 'DRIVING', required: false, minLevel: 'INTERMEDIATE' },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('job skills accept distinct skill codes', () => {
    expect(
      jobSkillsSchema.safeParse({
        skills: [
          { skillCode: 'DRIVING', required: true, minLevel: 'BEGINNER' },
          { skillCode: 'WELDING', required: false, minLevel: 'INTERMEDIATE' },
        ],
      }).success,
    ).toBe(true);
  });
});

// H16: the staff FORCE_CLOSE transition — the old CLOSE event was
// EMPLOYER-only, so staff force-close could never succeed.
describe('job machine FORCE_CLOSE', () => {
  it('a verifier can force-close an OPEN job', () => {
    expect(jobMachine.check('OPEN', 'FORCE_CLOSE', {}, ['VERIFIER'])).toMatchObject({
      ok: true,
      to: 'CLOSED',
    });
  });

  it('a branch admin and a super admin can force-close a PAUSED job', () => {
    expect(jobMachine.check('PAUSED', 'FORCE_CLOSE', {}, ['BRANCH_ADMIN'])).toMatchObject({
      ok: true,
      to: 'CLOSED',
    });
    expect(jobMachine.check('PAUSED', 'FORCE_CLOSE', {}, ['SUPER_ADMIN'])).toMatchObject({
      ok: true,
      to: 'CLOSED',
    });
  });

  it('staff and employers cannot force-close', () => {
    expect(jobMachine.check('OPEN', 'FORCE_CLOSE', {}, ['STAFF']).ok).toBe(false);
    expect(jobMachine.check('OPEN', 'FORCE_CLOSE', {}, ['EMPLOYER']).ok).toBe(false);
  });

  it('a DRAFT job cannot be force-closed', () => {
    expect(jobMachine.check('DRAFT', 'FORCE_CLOSE', {}, ['VERIFIER']).ok).toBe(false);
  });

  it('the employer CLOSE transition is unchanged (EMPLOYER-only)', () => {
    expect(jobMachine.check('OPEN', 'CLOSE', {}, ['EMPLOYER'])).toMatchObject({
      ok: true,
      to: 'CLOSED',
    });
    expect(jobMachine.check('OPEN', 'CLOSE', {}, ['VERIFIER']).ok).toBe(false);
  });
});

// Referral workflow §3 — employer field restrictions once the job is OPEN.
// Server enforcement lives in updateJob / setJobLocation /
// saveJobRequirements / saveJobSkills (profile.ts, needs a DB); the
// allowlist itself is pure (rules.ts) and is pinned here DB-free.
describe('employer field restrictions', () => {
  // N20: the bypass is role-based, not permission-based. EMPLOYER is the
  // restricted actor; STAFF / BRANCH_ADMIN / SUPER_ADMIN bypass; VERIFIER
  // does NOT bypass (it holds `job:manage` for posting, but the
  // restricted-field bypass was never decided for verifiers).
  const EMPLOYER: readonly Role[] = ['EMPLOYER'];
  const STAFF: readonly Role[] = ['STAFF'];
  const BRANCH_ADMIN: readonly Role[] = ['BRANCH_ADMIN'];
  const VERIFIER: readonly Role[] = ['VERIFIER'];
  const SUPER_ADMIN: readonly Role[] = ['SUPER_ADMIN'];
  const EMPLOYER_VERIFIER: readonly Role[] = ['EMPLOYER', 'VERIFIER'];

  const fullUpdate = {
    title: 'Driver',
    categoryCode: 'TRANSPORT',
    description: 'Drives the delivery van.',
    jobType: 'FULL_TIME',
    shift: 'ROTATING',
    shiftHours: 8,
    designationCode: 'DRIVER',
    genderPreference: 'ANY',
    vacancies: 2,
    salaryMin: 50_000,
    salaryMax: 80_000,
    closesAt: '2999-01-01T00:00:00.000Z',
    fuelAllowance: true,
    flexibleHours: false,
    annualLeaveDays: 15,
    sickLeaveDays: 10,
    casualLeaveDays: 10,
    medicalCoverage: 'BASIC',
    opdLimit: 50_000,
    ipdLimit: 200_000,
    medicalCoverageScope: 'FAMILY',
    bonusTier: 'TIER_1',
    bonusBasis: 'GROSS',
    bonusAmountPkr: 25_000,
    bonusFrequency: 'ANNUAL',
    workFromHome: false,
    providentFund: true,
    transportAllowance: false,
    eobi: true,
    lifeInsurance: false,
  } as const;

  it('the allowlist + restricted list cover every updateJob field exactly once', () => {
    const covered = [...EMPLOYER_OPEN_JOB_FIELDS, ...EMPLOYER_RESTRICTED_JOB_FIELDS];
    expect(new Set(covered).size).toBe(covered.length);
    expect([...covered].sort()).toEqual(Object.keys(fullUpdate).sort());
  });

  it('employer + OPEN: every restricted field is rejected', () => {
    expect(employerRestrictedUpdateFields(EMPLOYER, 'OPEN', fullUpdate)).toEqual([
      ...EMPLOYER_RESTRICTED_JOB_FIELDS,
    ]);
  });

  it('employer + OPEN: description and the non-pay benefits pass', () => {
    expect(
      employerRestrictedUpdateFields(EMPLOYER, 'OPEN', {
        description: 'New description.',
        fuelAllowance: true,
        flexibleHours: true,
        annualLeaveDays: 20,
        sickLeaveDays: 10,
        casualLeaveDays: 10,
        workFromHome: true,
        providentFund: true,
        transportAllowance: true,
        eobi: true,
        lifeInsurance: true,
      }),
    ).toEqual([]);
  });

  it('employer + OPEN: medical coverage and bonus tier are restricted, not benefits', () => {
    expect(
      employerRestrictedUpdateFields(EMPLOYER, 'OPEN', { medicalCoverage: 'COMPREHENSIVE' }),
    ).toEqual(['medicalCoverage']);
    expect(employerRestrictedUpdateFields(EMPLOYER, 'OPEN', { bonusTier: 'TIER_2' })).toEqual([
      'bonusTier',
    ]);
    expect(
      employerRestrictedUpdateFields(EMPLOYER, 'OPEN', {
        opdLimit: 50_000,
        ipdLimit: 200_000,
        medicalCoverageScope: 'FAMILY',
        bonusBasis: 'BASIC',
        bonusAmountPkr: 25_000,
        bonusFrequency: 'QUARTERLY',
      }),
    ).toEqual([
      'opdLimit',
      'ipdLimit',
      'medicalCoverageScope',
      'bonusBasis',
      'bonusAmountPkr',
      'bonusFrequency',
    ]);
    expect(employerRestrictedUpdateFields(EMPLOYER, 'OPEN', { shiftHours: 12 })).toEqual([
      'shiftHours',
    ]);
    expect(employerRestrictedUpdateFields(EMPLOYER, 'OPEN', { designationCode: 'DRIVER' })).toEqual(
      ['designationCode'],
    );
  });

  it('employer + PAUSED is restricted like OPEN', () => {
    expect(employerRestrictedUpdateFields(EMPLOYER, 'PAUSED', { title: 'New title' })).toEqual([
      'title',
    ]);
    expect(employerRestrictedUpdateFields(EMPLOYER, 'PAUSED', { salaryMin: 60_000 })).toEqual([
      'salaryMin',
    ]);
  });

  it('employer + DRAFT: everything is editable', () => {
    expect(employerRestrictedUpdateFields(EMPLOYER, 'DRAFT', fullUpdate)).toEqual([]);
  });

  it('staff + OPEN: everything is editable (full-field access kept)', () => {
    expect(employerRestrictedUpdateFields(STAFF, 'OPEN', fullUpdate)).toEqual([]);
    expect(employerRestrictedUpdateFields(STAFF, 'PAUSED', fullUpdate)).toEqual([]);
  });

  it('N20: branch admin and Super Admin bypass; verifier does not', () => {
    expect(employerRestrictedUpdateFields(BRANCH_ADMIN, 'OPEN', fullUpdate)).toEqual([]);
    expect(employerRestrictedUpdateFields(SUPER_ADMIN, 'OPEN', fullUpdate)).toEqual([]);
    // A verifier holds `job:manage` (for posting via staffCreateJob) but
    // that must not bypass the restricted-field allowlist.
    expect(employerRestrictedUpdateFields(VERIFIER, 'OPEN', fullUpdate)).toEqual([
      ...EMPLOYER_RESTRICTED_JOB_FIELDS,
    ]);
    // ... and neither does a dual EMPLOYER + VERIFIER account.
    expect(employerRestrictedUpdateFields(EMPLOYER_VERIFIER, 'OPEN', fullUpdate)).toEqual([
      ...EMPLOYER_RESTRICTED_JOB_FIELDS,
    ]);
  });

  it('only OPEN and PAUSED count as restricted statuses', () => {
    expect(isEmployerRestrictedJobStatus('DRAFT')).toBe(false);
    expect(isEmployerRestrictedJobStatus('OPEN')).toBe(true);
    expect(isEmployerRestrictedJobStatus('PAUSED')).toBe(true);
    expect(isEmployerRestrictedJobStatus('CLOSED')).toBe(false);
    expect(isEmployerRestrictedJobStatus('FILLED')).toBe(false);
    expect(isEmployerRestrictedJobStatus('EXPIRED')).toBe(false);
  });

  it('requirements: employer + OPEN may edit only the other-requirements text', () => {
    expect(
      employerRestrictedRequirementsFields(EMPLOYER, 'OPEN', {
        otherRequirements: 'Must hold a valid licence.',
      }),
    ).toEqual([]);
    expect(
      employerRestrictedRequirementsFields(EMPLOYER, 'OPEN', { minExperienceYears: 3 }),
    ).toEqual(['minExperienceYears']);
    expect(
      employerRestrictedRequirementsFields(EMPLOYER, 'OPEN', {
        experienceLevel: 'EXPERT',
        minExperienceMonths: 36,
      }),
    ).toEqual(['experienceLevel', 'minExperienceMonths']);
    expect(
      employerRestrictedRequirementsFields(EMPLOYER, 'OPEN', {
        educationLevelCode: 'BACHELORS',
        languageCodes: ['URDU'],
      }),
    ).toEqual(['educationLevelCode', 'languageCodes']);
  });

  it('requirements: DRAFT and staff keep full access', () => {
    const full = {
      educationLevelCode: 'BACHELORS',
      minExperienceYears: 3,
      experienceLevel: 'EXPERT' as const,
      minExperienceMonths: 36,
      languageCodes: ['URDU' as const],
      otherRequirements: 'Must hold a valid licence.',
    };
    expect(employerRestrictedRequirementsFields(EMPLOYER, 'DRAFT', full)).toEqual([]);
    expect(employerRestrictedRequirementsFields(STAFF, 'OPEN', full)).toEqual([]);
    expect(employerRestrictedRequirementsFields(SUPER_ADMIN, 'OPEN', full)).toEqual([]);
    // N20: a verifier does not bypass the requirements allowlist either.
    expect(employerRestrictedRequirementsFields(VERIFIER, 'OPEN', full)).toEqual([
      ...EMPLOYER_RESTRICTED_REQUIREMENTS_FIELDS,
    ]);
  });

  it('location and skills: employer blocked once OPEN, allowed in DRAFT; staff always allowed', () => {
    expect(employerMayEditJobSubResource(EMPLOYER, 'OPEN')).toBe(false);
    expect(employerMayEditJobSubResource(EMPLOYER, 'PAUSED')).toBe(false);
    expect(employerMayEditJobSubResource(EMPLOYER, 'DRAFT')).toBe(true);
    expect(employerMayEditJobSubResource(STAFF, 'OPEN')).toBe(true);
    expect(employerMayEditJobSubResource(STAFF, 'DRAFT')).toBe(true);
    // N20: Super Admin bypasses; a verifier does not.
    expect(employerMayEditJobSubResource(SUPER_ADMIN, 'OPEN')).toBe(true);
    expect(employerMayEditJobSubResource(VERIFIER, 'OPEN')).toBe(false);
  });

  it('the company is never changeable via the employer PATCH: companyId is stripped', () => {
    const parsed = updateJobSchema.parse({
      companyId: '00000000-0000-4000-8000-000000000001',
      title: 'New title',
    });
    expect('companyId' in parsed).toBe(false);
    expect(parsed).toEqual({ title: 'New title' });
  });
});
