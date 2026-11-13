import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as apiClientModule from '@/lib/api/client';
import { ApiClientError } from '@/lib/api/client';
import { CompanyWizard } from './CompanyWizard';

const push = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }) }));

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));
vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof apiClientModule>();
  return { ...actual, apiFetch: apiFetchMock };
});

const { putWithProgressMock } = vi.hoisted(() => ({
  putWithProgressMock: vi.fn(async () => {}),
}));
vi.mock('@/lib/upload/put-with-progress', () => ({
  putWithProgress: putWithProgressMock,
}));

describe('CompanyWizard', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    putWithProgressMock.mockReset();
    putWithProgressMock.mockImplementation(async () => {});
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path === '/api/v1/master-data?type=INDUSTRY') {
        return { data: [{ code: 'IT', label: 'Information technology' }] };
      }
      if (path.startsWith('/api/v1/geocode/search')) {
        return {
          data: [
            {
              lat: 24.8615,
              lng: 67.0099,
              addressLine: 'Zaitoon Ashraf IT Park, Mehmoodabad, Karachi',
              cityCode: 'KARACHI',
              cityLabel: 'Karachi',
              display: 'Zaitoon Ashraf IT Park, Mehmoodabad, Karachi, Pakistan',
            },
          ],
        };
      }
      if (path.startsWith('/api/v1/companies/me/branch-options')) {
        return { data: [{ id: 'b0000000-0000-4000-8000-000000000001', name: 'Karachi Branch' }] };
      }
      if (path === '/api/v1/companies/me/head-office') {
        return {
          data: {
            id: 'company-1',
            status: 'DRAFT',
            branch: { id: 'b0000000-0000-4000-8000-000000000001', name: 'Karachi Branch' },
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
            headOffice: {
              id: 'loc-1',
              kind: 'HEAD_OFFICE',
              label: 'Head office',
              addressLine: 'Zaitoon Ashraf IT Park, Mehmoodabad, Karachi',
              cityCode: 'KARACHI',
              areaCode: null,
              location: { lat: 24.8615, lng: 67.0099 },
            },
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
          },
        };
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
          optionalDocuments: [],
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

  // Location step: a manually typed address + city must enable Save — the
  // old step required a picked suggestion (coords + branch) first, but
  // search called OpenCage with an empty key so no suggestion ever
  // appeared and the button stayed dead. Save now locates the typed
  // address via the server geocode endpoint and picks the nearest branch.
  it('enables Save for a typed address and locates it on save', async () => {
    const user = userEvent.setup();
    render(
      <CompanyWizard
        initialStep="location"
        initialCompany={
          {
            ...infoRequestedCompany([]),
            status: 'DRAFT',
            verification: null,
            headOffice: null,
          } as never
        }
      />,
    );

    await user.type(screen.getByLabelText(/Full address/), 'Zaitoon Ashraf IT Park, Mehmoodabad');
    await user.type(screen.getByLabelText(/^City/), 'Karachi');

    const saveButton = screen.getByRole('button', { name: 'Save and continue' });
    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/companies/me/head-office', {
        method: 'PUT',
        body: {
          location: { lat: 24.8615, lng: 67.0099 },
          addressLine: 'Zaitoon Ashraf IT Park, Mehmoodabad',
          cityCode: 'KARACHI',
          areaCode: undefined,
          branchId: 'b0000000-0000-4000-8000-000000000001',
        },
      }),
    );
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/employer/company?step=documents', {
        scroll: false,
      }),
    );
  });

  // Geocode down / no result must not strand the user again: Save falls
  // back to the typed city's centre and still picks the nearest branch.
  it('saves with the city centre when geocode returns nothing', async () => {
    apiFetchMock.mockImplementationOnce(async () => ({ data: [] }));
    const user = userEvent.setup();
    render(
      <CompanyWizard
        initialStep="location"
        initialCompany={
          {
            ...infoRequestedCompany([]),
            status: 'DRAFT',
            verification: null,
            headOffice: null,
          } as never
        }
      />,
    );

    await user.type(screen.getByLabelText(/Full address/), 'Zaitoon Ashraf IT Park, Mehmoodabad');
    await user.type(screen.getByLabelText(/^City/), 'Karachi');

    await user.click(screen.getByRole('button', { name: 'Save and continue' }));

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/companies/me/head-office', {
        method: 'PUT',
        body: {
          location: { lat: 24.8607, lng: 67.0011 },
          addressLine: 'Zaitoon Ashraf IT Park, Mehmoodabad',
          cityCode: 'KARACHI',
          areaCode: undefined,
          branchId: 'b0000000-0000-4000-8000-000000000001',
        },
      }),
    );
  });

  // City is manual (2026-11-13): picking a search suggestion must not
  // overwrite the city the employer typed — search results can come back
  // in Urdu. The mocked suggestion carries city Karachi; the employer
  // typed Lahore, so the save must carry LAHORE.
  it('does not overwrite the typed city when a suggestion is picked', async () => {
    const user = userEvent.setup();
    render(
      <CompanyWizard
        initialStep="location"
        initialCompany={
          {
            ...infoRequestedCompany([]),
            status: 'DRAFT',
            verification: null,
            headOffice: null,
          } as never
        }
      />,
    );

    await user.type(screen.getByLabelText(/Search address/), 'Zaitoon Ashraf IT Park');
    // Debounced search returns the mocked Karachi suggestion.
    const suggestion = await screen.findByRole(
      'button',
      { name: 'Zaitoon Ashraf IT Park, Mehmoodabad, Karachi, Pakistan' },
      { timeout: 3000 },
    );
    await user.type(screen.getByLabelText(/^City/), 'Lahore');
    await user.click(suggestion);

    await user.click(screen.getByRole('button', { name: 'Save and continue' }));

    // The save chain is debounced search → pick → geocode → PUT, which
    // can take over the 1000 ms default under a parallel full-suite run
    // on this VM (flaked twice at the default timeout).
    await waitFor(
      () =>
        expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/companies/me/head-office', {
          method: 'PUT',
          body: {
            location: { lat: 24.8615, lng: 67.0099 },
            addressLine: 'Zaitoon Ashraf IT Park, Mehmoodabad, Karachi, Pakistan',
            cityCode: 'LAHORE',
            areaCode: undefined,
            branchId: 'b0000000-0000-4000-8000-000000000001',
          },
        }),
      { timeout: 5000 },
    );
  });

  // The branch is assigned silently (2026-11-13): no "Nearest Job Bank
  // branch" field is shown on the location step, even once branches load.
  it('does not show a nearest branch field on the location step', async () => {
    render(
      <CompanyWizard
        initialStep="location"
        initialCompany={
          {
            ...infoRequestedCompany([]),
            status: 'DRAFT',
            verification: null,
            headOffice: {
              id: 'loc-1',
              kind: 'HQ',
              label: 'Head office',
              addressLine: 'Zaitoon Ashraf IT Park, Mehmoodabad',
              cityCode: 'KARACHI',
              areaCode: null,
              location: { lat: 24.8615, lng: 67.0099 },
            },
          } as never
        }
      />,
    );

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        '/api/v1/companies/me/branch-options?lat=24.8615&lng=67.0099',
      ),
    );
    expect(screen.queryByLabelText(/Nearest Job Bank branch/)).not.toBeInTheDocument();
    expect(screen.queryByText(/nearest branch/i)).not.toBeInTheDocument();
  });

  // Area is free text but the backend wants a master-data AREA code:
  // sending "DHA Phase 5" as areaCode 422s the whole save.
  it('does not send free-text area as areaCode', async () => {
    const user = userEvent.setup();
    render(
      <CompanyWizard
        initialStep="location"
        initialCompany={
          {
            ...infoRequestedCompany([]),
            status: 'DRAFT',
            verification: null,
            headOffice: null,
          } as never
        }
      />,
    );

    await user.type(screen.getByLabelText(/Full address/), 'Zaitoon Ashraf IT Park, Mehmoodabad');
    await user.type(screen.getByLabelText(/^City/), 'Karachi');
    await user.type(screen.getByLabelText(/^Area/), 'DHA Phase 5');

    await user.click(screen.getByRole('button', { name: 'Save and continue' }));

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        '/api/v1/companies/me/head-office',
        expect.objectContaining({
          body: expect.objectContaining({ areaCode: undefined }),
        }),
      ),
    );
  });

  // Documents step (migration 0040): the authorised person's CNIC is two
  // separate uploads — front and back — not one "front or back" slot, and a
  // phone photo named IMG_1234.jpg must upload: the old filename check
  // ("cnic|id|nic|identity") rejected it and showed the orange warning.
  // NTN / SECP / address proof are OPTIONAL (2026-11-13), not required.
  const documentsCompany = () => ({
    ...infoRequestedCompany([]),
    status: 'DRAFT',
    verification: null,
    requiredDocuments: ['AUTHORISED_PERSON_CNIC_FRONT', 'AUTHORISED_PERSON_CNIC_BACK'],
    optionalDocuments: ['NTN_CERTIFICATE', 'SECP_REGISTRATION', 'ADDRESS_PROOF'],
  });

  it('shows NTN, SECP and address proof as optional, CNIC as required', () => {
    render(<CompanyWizard initialStep="documents" initialCompany={documentsCompany() as never} />);

    expect(screen.getByText('NTN CERTIFICATE')).toBeInTheDocument();
    expect(screen.getByText('SECP REGISTRATION')).toBeInTheDocument();
    expect(screen.getByText('ADDRESS PROOF')).toBeInTheDocument();
    expect(screen.getAllByText('Optional')).toHaveLength(3);
    expect(screen.getAllByText('Required')).toHaveLength(2);
  });

  it('shows separate CNIC front and back uploads with their own hints', () => {
    render(<CompanyWizard initialStep="documents" initialCompany={documentsCompany() as never} />);

    expect(screen.getByText('AUTHORISED PERSON CNIC FRONT')).toBeInTheDocument();
    expect(screen.getByText('AUTHORISED PERSON CNIC BACK')).toBeInTheDocument();
    expect(screen.getByText('Upload a clear photo of the front of the CNIC.')).toBeInTheDocument();
    expect(screen.getByText('Upload a clear photo of the back of the CNIC.')).toBeInTheDocument();
    expect(screen.queryByText('AUTHORISED PERSON CNIC')).not.toBeInTheDocument();
    expect(screen.queryByText(/clear image of your CNIC/)).not.toBeInTheDocument();
  });

  it('uploads a CNIC front photo named IMG_1234.jpg', async () => {
    const company = documentsCompany();
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path === '/api/v1/companies/me/documents') {
        return {
          data: {
            documentId: 'doc-1',
            upload: {
              url: 'https://storage.example/upload',
              headers: { 'Content-Type': 'image/jpeg' },
            },
          },
        };
      }
      if (path === '/api/v1/companies/me/documents/doc-1/confirm') {
        return {
          data: {
            ...company,
            documents: [
              {
                id: 'doc-1',
                typeCode: 'AUTHORISED_PERSON_CNIC_FRONT',
                fileName: 'IMG_1234.jpg',
                contentType: 'image/jpeg',
                sizeBytes: 5,
                reviewStatus: 'PENDING',
                reviewNote: null,
                uploadedAt: '2026-11-10T14:00:00.000Z',
              },
            ],
          },
        };
      }
      return { data: company };
    });
    try {
      const user = userEvent.setup();
      render(<CompanyWizard initialStep="documents" initialCompany={company as never} />);

      const inputs = screen.getAllByLabelText('Upload');
      await user.upload(inputs[0]!, new File(['front'], 'IMG_1234.jpg', { type: 'image/jpeg' }));

      await waitFor(() =>
        expect(apiFetchMock).toHaveBeenCalledWith('/api/v1/companies/me/documents', {
          method: 'POST',
          body: {
            typeCode: 'AUTHORISED_PERSON_CNIC_FRONT',
            fileName: 'IMG_1234.jpg',
            contentType: 'image/jpeg',
            sizeBytes: 5,
          },
        }),
      );
      // The storage PUT goes through the shared helper with the signed
      // headers (2026-11-13 "Failed to fetch" fix), not a bare fetch.
      await waitFor(() =>
        expect(putWithProgressMock).toHaveBeenCalledWith({
          url: 'https://storage.example/upload',
          file: expect.any(File),
          headers: { 'Content-Type': 'image/jpeg' },
        }),
      );
      await waitFor(() => expect(screen.getByText('Uploaded')).toBeInTheDocument());
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects a PDF for the CNIC front instead of uploading it', async () => {
    // fireEvent, not userEvent.upload: the input's accept=".jpg,.jpeg,.png"
    // stops a PDF being picked in the file dialog at all, so the check is
    // exercised by setting the file directly (as a drag/drop would).
    render(<CompanyWizard initialStep="documents" initialCompany={documentsCompany() as never} />);

    const inputs = screen.getAllByLabelText('Upload');
    fireEvent.change(inputs[0]!, {
      target: { files: [new File(['%PDF-'], 'cnic.pdf', { type: 'application/pdf' })] },
    });

    await waitFor(() =>
      expect(screen.getByText('Upload a JPG or PNG photo of the CNIC.')).toBeInTheDocument(),
    );
    expect(apiFetchMock).not.toHaveBeenCalledWith(
      '/api/v1/companies/me/documents',
      expect.anything(),
    );
  });

  it('uses a distinct idempotency key for company creation and verification submission', async () => {
    const company = {
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
      createdAt: '2026-10-01T00:00:00.000Z',
    };
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path === '/api/v1/master-data?type=INDUSTRY')
        return { data: [{ code: 'IT', label: 'Information technology' }] };
      if (path === '/api/v1/companies/me/submit')
        return { data: { ...company, status: 'SUBMITTED' } };
      return { data: company };
    });

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

    await user.click(await screen.findByRole('button', { name: 'Review' }));
    await user.click(screen.getByRole('button', { name: 'Submit for verification' }));

    await waitFor(() => {
      const registrationCall = apiFetchMock.mock.calls.find(
        ([path]) => path === '/api/v1/companies/register',
      );
      const submissionCall = apiFetchMock.mock.calls.find(
        ([path]) => path === '/api/v1/companies/me/submit',
      );
      expect(registrationCall).toBeDefined();
      expect(submissionCall).toBeDefined();
      expect(registrationCall![1].idempotencyKey).not.toBe(submissionCall![1].idempotencyKey);
    });
  });

  it('shows a duplicate NTN on the NTN field, not as a page error', async () => {
    apiFetchMock.mockImplementation(async (path: string) => {
      if (path === '/api/v1/master-data?type=INDUSTRY')
        return { data: [{ code: 'IT', label: 'Information technology' }] };
      if (path === '/api/v1/companies/register')
        throw new ApiClientError(409, {
          error: {
            code: 'CONFLICT',
            message:
              'A company with this NTN is already registered with Saylani Job Bank. If it is yours, please contact your nearest Job Bank branch.',
            details: { reason: 'NTN_TAKEN' },
            correlation_id: 'test',
          },
        });
      throw new Error(`unexpected call ${path}`);
    });

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

    // The field error names the NTN field; the error summary lists the same
    // message a second time with a jump-to-field button.
    await waitFor(() =>
      expect(screen.getAllByText(/already registered with Saylani Job Bank/)).toHaveLength(2),
    );
    const fieldError = screen
      .getAllByText(/already registered with Saylani Job Bank/)
      .map((el) => el.closest('p'))
      .find((p) => p?.getAttribute('role') === 'alert');
    expect(fieldError).toBeTruthy();
    expect(fieldError).toHaveAttribute('id', expect.stringContaining('-error'));
    expect(
      screen.getByLabelText(/NTN \(National Tax Number\)/).getAttribute('aria-describedby'),
    ).toContain(fieldError?.id);
  });
});
