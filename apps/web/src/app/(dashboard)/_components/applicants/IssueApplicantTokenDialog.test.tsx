import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApplicantTokenView } from '@jobbank/shared';
import { IssueApplicantTokenDialog } from './IssueApplicantTokenDialog';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const branchId = '123e4567-e89b-12d3-a456-426614174000';

const token: ApplicantTokenView = {
  id: '00000000-0000-0000-0000-000000000001',
  tokenNumber: 1,
  tokenCode: 'KHI-GULSHAN-001',
  branchId,
  branchCode: 'KHI-GULSHAN',
  branchName: 'Karachi — Gulshan-e-Iqbal',
  cnic: '4210112345671',
  applicantName: 'Ahmed Raza',
  phone: '+923001234567',
  issuedAt: '2026-11-07T14:39:20.000Z',
  status: 'ISSUED',
  applicantId: null,
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function open() {
  render(
    <IssueApplicantTokenDialog
      branches={[{ value: branchId, label: 'Karachi — Gulshan-e-Iqbal' }]}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Issue token' }));
  return screen.getByRole('dialog');
}

describe('IssueApplicantTokenDialog', () => {
  it('collects CNIC, name and phone, then shows only a Print button', async () => {
    fetchMock.mockResolvedValue(json(201, { data: token }));
    await open();

    await userEvent.type(screen.getByLabelText(/CNIC number/), '4210112345671');
    await userEvent.type(screen.getByLabelText(/Applicant name/), 'Ahmed Raza');
    await userEvent.type(screen.getByLabelText('Phone number'), '3001234567');
    await userEvent.click(screen.getByRole('button', { name: 'Generate token' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Print token' })).toBeInTheDocument(),
    );
    // The slip renders twice: on screen in the dialog and in the print portal.
    expect(screen.getAllByText('01')).toHaveLength(2);
    expect(screen.getAllByText('+92 300 1234567')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Print token' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Issue another token' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument();

    const body = JSON.parse(fetchMock.mock.lastCall![1].body as string);
    expect(body).toMatchObject({
      branchId,
      cnic: '4210112345671',
      applicantName: 'Ahmed Raza',
      phone: '+923001234567',
    });
  });

  it('shows a field error for an invalid phone number', async () => {
    await open();

    await userEvent.type(screen.getByLabelText(/CNIC number/), '4210112345671');
    await userEvent.type(screen.getByLabelText(/Applicant name/), 'Ahmed Raza');
    await userEvent.type(screen.getByLabelText('Phone number'), '30012');
    await userEvent.click(screen.getByRole('button', { name: 'Generate token' }));

    await waitFor(() =>
      expect(screen.getByText(/Enter a Pakistani phone number/)).toBeInTheDocument(),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
