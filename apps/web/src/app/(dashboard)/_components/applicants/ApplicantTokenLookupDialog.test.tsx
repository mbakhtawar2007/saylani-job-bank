import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApplicantTokenView } from '@jobbank/shared';
import { ApplicantTokenLookupDialog } from './ApplicantTokenLookupDialog';

// RegisterApplicantDialog (rendered closed inside the lookup dialog) uses the
// app router; the test mounts no router, so stub it like the other dialog tests.
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), refresh, push: vi.fn() }),
  usePathname: () => '/staff/applicants',
}));

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const branchId = '123e4567-e89b-12d3-a456-426614174000';

const token: ApplicantTokenView = {
  id: '00000000-0000-0000-0000-000000000001',
  tokenNumber: 7,
  tokenCode: 'KHI-GULSHAN-007',
  branchId,
  branchCode: 'KHI-GULSHAN',
  branchName: 'Karachi — Gulshan-e-Iqbal',
  cnic: '4210112345671',
  applicantName: 'Ahmed Raza',
  phone: '+923001234567',
  issuedAt: '2026-11-08T04:39:20.000Z',
  expiresAt: '2026-11-08T19:00:00.000Z',
  expired: false,
  status: 'ISSUED',
  applicantId: null,
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function open() {
  render(
    <ApplicantTokenLookupDialog
      branches={[{ value: branchId, label: 'Karachi — Gulshan-e-Iqbal' }]}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Find token' }));
  return screen.getByRole('dialog');
}

describe('ApplicantTokenLookupDialog', () => {
  it('looks a token up by code and shows its slip with reprint actions', async () => {
    fetchMock.mockResolvedValue(json(200, { data: [token] }));
    const dialog = await open();

    await userEvent.type(within(dialog).getByLabelText(/Token code/), 'KHI-GULSHAN-007');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Find token' }));

    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Print token' })).toBeInTheDocument(),
    );
    // The code shows three times: the status line, the slip in the dialog,
    // and the slip in the print portal.
    expect(screen.getAllByText('KHI-GULSHAN-007')).toHaveLength(3);
    expect(
      within(dialog).getByRole('button', { name: 'Complete registration' }),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Cancel token' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/applicants/tokens?tokenCode=KHI-GULSHAN-007',
      expect.anything(),
    );
  });

  it('shows no token found when the lookup comes back empty', async () => {
    fetchMock.mockResolvedValue(json(200, { data: [] }));
    const dialog = await open();

    await userEvent.type(within(dialog).getByLabelText(/Token code/), 'KHI-GULSHAN-999');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Find token' }));

    await waitFor(() =>
      expect(screen.getByText('No token matches this search.')).toBeInTheDocument(),
    );
  });

  it('cancels an issued token after an inline confirm', async () => {
    fetchMock
      .mockResolvedValueOnce(json(200, { data: [token] }))
      .mockResolvedValueOnce(json(200, { data: { ...token, status: 'CANCELLED' } }));
    const dialog = await open();

    await userEvent.type(within(dialog).getByLabelText(/Token code/), 'KHI-GULSHAN-007');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Find token' }));
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Cancel token' })).toBeInTheDocument(),
    );

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel token' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Yes, cancel token' }));

    await waitFor(() => expect(within(dialog).getByText(/Cancelled/)).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/applicants/tokens/${token.id}/cancel`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('flags an expired token and hides the registration action', async () => {
    fetchMock.mockResolvedValue(json(200, { data: [{ ...token, expired: true }] }));
    const dialog = await open();

    await userEvent.type(within(dialog).getByLabelText(/Token code/), 'KHI-GULSHAN-007');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Find token' }));

    await waitFor(() =>
      expect(
        within(dialog).getByText(/This token expired at the end of its issue day/),
      ).toBeInTheDocument(),
    );
    expect(
      within(dialog).queryByRole('button', { name: 'Complete registration' }),
    ).not.toBeInTheDocument();
  });
});
