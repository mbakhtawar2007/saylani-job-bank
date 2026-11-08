import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as apiClientModule from '@/lib/api/client';
import { CompanyWizard } from './CompanyWizard';

const push = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }) }));

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));
vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof apiClientModule>();
  return { ...actual, apiFetch: apiFetchMock };
});

describe('CompanyWizard', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path === '/api/v1/master-data?type=INDUSTRY') {
        return { data: [{ code: 'IT', label: 'Information technology' }] };
      }
      if (path === '/api/v1/companies/me/submit') {
        return {
          data: {
            id: 'company-1',
            status: 'SUBMITTED',
            branch: null,
            details: {
              legalName: 'Example Company',
              tradeName: null,
              legalStructure: 'PRIVATE_LIMITED',
              ntn: '1234567-8',
              registrationNo: null,
              industryCode: 'IT',
              sizeBand: '1_10',
              website: null,
              description: null,
            },
            contacts: [],
            headOffice: null,
            sites: [],
            documents: [],
            requiredDocuments: [],
            missing: [],
            verification: null,
            editable: true,
            verifiedAt: null,
            createdAt: '2026-10-08T00:00:00.000Z',
          },
        };
      }
      if (path === '/api/v1/companies/me/resubmit') {
        return {
          data: {
            id: 'company-1',
            status: 'RESUBMITTED',
            branch: null,
            details: {
              legalName: 'Example Company',
              tradeName: null,
              legalStructure: 'PRIVATE_LIMITED',
              ntn: '1234567-8',
              registrationNo: null,
              industryCode: 'IT',
              sizeBand: '1_10',
              website: null,
              description: null,
            },
            contacts: [],
            headOffice: null,
            sites: [],
            documents: [],
            requiredDocuments: [],
            missing: [],
            verification: null,
            editable: true,
            verifiedAt: null,
            createdAt: '2026-10-08T00:00:00.000Z',
          },
        };
      }
      return {
        data: {
          id: 'company-1',
          status: 'DRAFT',
          details: {
            legalName: 'Example Company',
            legalStructure: 'LIMITED',
            ntn: '1234567-8',
            industryCode: 'IT',
            sizeBand: '1-10',
          },
          contacts: [],
          sites: [],
          documents: [],
          verification: null,
        },
      };
    });
  });

  it('sends an idempotency key when registering company details', async () => {
    const user = userEvent.setup();
    render(<CompanyWizard initialStep="details" initialCompany={null} />);

    await user.type(screen.getByLabelText(/Registered company name/), 'Example Company');
    await user.selectOptions(screen.getByLabelText(/Business type/), 'PRIVATE_LIMITED');
    await user.type(screen.getByLabelText(/NTN \(National Tax Number\)/), '1234567-8');
    const industry = screen.getByLabelText(/Industry/);
    await waitFor(() => expect(industry).toHaveTextContent('Information technology'));
    await user.selectOptions(industry, 'IT');
    await user.selectOptions(screen.getByLabelText(/Company size/), '1_10');
    const saveButton = screen.getByRole('button', { name: 'Save and continue' });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/companies/register', {
        method: 'POST',
        body: expect.any(Object),
        idempotencyKey: expect.stringMatching(/[0-9a-f-]{36}/),
      }),
    );
  });

  it('sends an idempotency key when submitting company data for verification', async () => {
    const user = userEvent.setup();
    render(
      <CompanyWizard
        initialStep="submit"
        initialCompany={{
          id: 'company-1',
          status: 'DRAFT',
          branch: null,
          details: {
            legalName: 'Example Company',
            tradeName: null,
            legalStructure: 'PRIVATE_LIMITED',
            ntn: '1234567-8',
            registrationNo: null,
            industryCode: 'IT',
            sizeBand: '1_10',
            website: null,
            description: null,
          },
          contacts: [],
          headOffice: null,
          sites: [],
          documents: [],
          requiredDocuments: [],
          missing: [],
          verification: null,
          editable: {
            details: true,
            legal: true,
            contacts: true,
            locations: true,
            branch: true,
            documents: true,
          },
          verifiedAt: null,
          registrationVerifiedSignedAt: null,
          registrationVerifiedSignedBy: null,
          createdAt: '2026-10-01T00:00:00.000Z',
        }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Submit for verification' }));

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/companies/me/submit', {
        method: 'POST',
        idempotencyKey: expect.stringMatching(/[0-9a-f-]{36}/),
      }),
    );
  });

  // M18: the resubmit button stays disabled until the employer says what
  // changed (10+ characters) or uploaded a document after the request.
  const infoRequestedCompany = (documents: unknown[]) => ({
    id: 'company-1',
    status: 'INFO_REQUESTED',
    branch: null,
    details: {
      legalName: 'Example Company',
      tradeName: null,
      legalStructure: 'PRIVATE_LIMITED',
      ntn: '1234567-8',
      registrationNo: null,
      industryCode: 'IT',
      sizeBand: '1_10',
      website: null,
      description: null,
    },
    contacts: [],
    headOffice: null,
    sites: [],
    documents,
    requiredDocuments: [],
    missing: [],
    verification: {
      id: 'verification-1',
      round: 1,
      state: 'INFO_REQUESTED',
      submittedAt: '2026-11-06T10:00:00.000Z',
      clockStartedAt: '2026-11-06T10:00:00.000Z',
      slaDueOn: '2026-11-10',
      sla: 'PAUSED',
      infoRequest: 'Please upload the renewed NTN certificate.',
      infoRequestedAt: '2026-11-07T10:00:00.000Z',
      employerNote: null,
      decidedAt: null,
      rejectionReasonCode: null,
      decisionNote: null,
    },
    editable: {
      details: true,
      legal: true,
      contacts: true,
      locations: true,
      branch: true,
      documents: true,
    },
    verifiedAt: null,
    registrationVerifiedSignedAt: null,
    registrationVerifiedSignedBy: null,
    createdAt: '2026-10-01T00:00:00.000Z',
  });

  it('keeps resubmit disabled until a 10+ character note is written, then sends it', async () => {
    const user = userEvent.setup();
    render(
      <CompanyWizard initialStep="submit" initialCompany={infoRequestedCompany([]) as never} />,
    );

    const sendBack = screen.getByRole('button', { name: 'Send back to verifier' });
    expect(sendBack).toBeDisabled();
    const note = screen.getByLabelText(/What did you change or send?/);
    await user.type(note, 'fixed it');
    expect(sendBack).toBeDisabled();
    await user.type(note, ' — uploaded the renewed certificate');
    await waitFor(() => expect(sendBack).toBeEnabled());
    await user.click(sendBack);

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/companies/me/resubmit', {
        method: 'POST',
        body: { note: 'fixed it — uploaded the renewed certificate' },
      }),
    );
  });

  it('enables resubmit without a note when a document was uploaded after the request', async () => {
    const user = userEvent.setup();
    render(
      <CompanyWizard
        initialStep="submit"
        initialCompany={
          infoRequestedCompany([
            {
              id: 'doc-1',
              typeCode: 'NTN_CERTIFICATE',
              fileName: 'ntn.pdf',
              contentType: 'application/pdf',
              sizeBytes: 1234,
              reviewStatus: 'PENDING',
              reviewNote: null,
              uploadedAt: '2026-11-07T12:00:00.000Z',
            },
          ]) as never
        }
      />,
    );

    const sendBack = screen.getByRole('button', { name: 'Send back to verifier' });
    expect(sendBack).toBeEnabled();
    await user.click(sendBack);

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/companies/me/resubmit', {
        method: 'POST',
        body: { note: null },
      }),
    );
  });
});
