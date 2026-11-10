import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiClientModule from '@/lib/api/client';
import type { ApplicantStaffView } from '@/domains/applicant';
import { StaffRegisterApplicantForm } from './StaffRegisterApplicantForm';

const { apiFetchMock, pushMock, refreshMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

vi.mock('@/components/organisms', () => ({
  MapPinPicker: () => null,
}));

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiClientModule>();
  return { ...actual, apiFetch: apiFetchMock };
});

const applicant: ApplicantStaffView = {
  id: '60ee8ed9-d26a-45fb-b28b-76fd89184080',
  registrationReference: 'SJB-2026-TEST',
  registrationSource: 'STAFF_ASSISTED',
  registeredAt: '2026-01-01T00:00:00.000Z',
  status: 'ACTIVE',
  identityStatus: 'UNVERIFIED',
  identityNote: null,
  branch: null,
  personal: {
    fullName: 'Existing Applicant',
    fatherName: 'Applicant Parent',
    cnic: '4210112345671',
    dateOfBirth: '1995-04-12',
    gender: 'FEMALE',
    email: 'applicant@example.test',
    phone: '+923001234567',
  },
  address: {
    addressLine: 'House 12, Block 13-D',
    cityCode: 'KARACHI',
    areaCode: null,
    location: { lat: 24.9256, lng: 67.0899 },
  },
  education: [],
  experience: [],
  hasNoExperience: false,
  skills: [],
  languages: [],
  certifications: [],
  recordIds: { education: [], experience: [], certifications: [] },
  preferences: null,
  documents: [],
  completeness: { percent: 0, sections: [], activationMissing: [] },
  identityLocked: false,
  branchLocked: false,
  permanentAddress: null,
  additionalNotes: null,
  registrationVerifiedSignedAt: null,
  registrationVerifiedSignedBy: null,
  activatedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  userId: '6062ad58-cc05-451e-a7db-d8a5afcc6e37',
  statusReason: null,
  createdByStaff: null,
  identityHistory: [],
  can: {
    verifyIdentity: false,
    manage: true,
    transfer: false,
    shortlist: false,
    scheduleInterview: false,
    referToEmployer: false,
  },
};

const options = {
  branches: [],
  cities: [{ value: 'KARACHI', label: 'Karachi' }],
  areas: [],
  educationLevels: [],
  skills: [],
  languages: [],
  categories: [],
  basePath: '/super-admin/applicants',
};

describe('StaffRegisterApplicantForm edit mode', () => {
  beforeEach(() => {
    apiFetchMock.mockReset().mockResolvedValue({ data: { id: applicant.id } });
    pushMock.mockReset();
    refreshMock.mockReset();
  });

  it('prefills the applicant and updates the existing profile through PATCH', async () => {
    const user = userEvent.setup();
    render(<StaffRegisterApplicantForm {...options} applicant={applicant} />);

    expect(screen.getByDisplayValue('Existing Applicant')).toBeInTheDocument();
    expect(screen.getByDisplayValue('applicant@example.test')).toBeInTheDocument();
    expect(screen.getByDisplayValue('+923001234567')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Male' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Female' })).toBeChecked();
    expect(screen.queryByRole('radio', { name: 'Prefer not to say' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Review profile update' }));
    await user.click(screen.getByRole('button', { name: 'Update Profile' }));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledTimes(1);
      expect(apiFetchMock).toHaveBeenCalledWith(
        `/api/v1/applicants/${applicant.id}/profile`,
        expect.objectContaining({ method: 'PATCH', body: expect.any(Object) }),
      );
    });
    expect(apiFetchMock.mock.calls[0]?.[0]).not.toBe('/api/v1/applicants/staff-register');
    expect(pushMock).toHaveBeenCalledWith(`/super-admin/applicants/${applicant.id}`);
  });

  it('preserves an existing unspecified gender unless a new option is selected', async () => {
    const user = userEvent.setup();
    render(
      <StaffRegisterApplicantForm
        {...options}
        applicant={{ ...applicant, personal: { ...applicant.personal, gender: 'UNDISCLOSED' } }}
      />,
    );

    expect(screen.getByText(/Gender is currently unspecified/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Male' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Female' })).not.toBeChecked();
    expect(screen.queryByRole('radio', { name: 'Prefer not to say' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Review profile update' }));
    await user.click(screen.getByRole('button', { name: 'Update Profile' }));
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        `/api/v1/applicants/${applicant.id}/profile`,
        expect.objectContaining({ body: expect.objectContaining({ gender: 'UNDISCLOSED' }) }),
      ),
    );
  });

  it('allows an existing unspecified gender to be changed', async () => {
    const user = userEvent.setup();
    render(
      <StaffRegisterApplicantForm
        {...options}
        applicant={{ ...applicant, personal: { ...applicant.personal, gender: 'UNDISCLOSED' } }}
      />,
    );

    await user.click(screen.getByRole('radio', { name: 'Male' }));
    await user.click(screen.getByRole('button', { name: 'Review profile update' }));
    await user.click(screen.getByRole('button', { name: 'Update Profile' }));
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        `/api/v1/applicants/${applicant.id}/profile`,
        expect.objectContaining({ body: expect.objectContaining({ gender: 'MALE' }) }),
      ),
    );
  });
});
