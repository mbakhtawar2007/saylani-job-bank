import { describe, expect, it } from 'vitest';
import { createJobSchema, updateJobSchema } from '@jobbank/shared';

// Regression test for the H9 finding: updateJobSchema used to be
// createJobSchema.partial(), and zod defaults survive .partial() — so a
// PATCH that only changed the title silently reset gender preference and
// every benefit/perk field to its default.
describe('job schemas', () => {
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
      shift: 'DAY',
      vacancies: 2,
    });
    expect(parsed.genderPreference).toBe('ANY');
    expect(parsed.fuelAllowance).toBe(false);
    expect(parsed.medicalCoverage).toBe('NONE');
  });
});
