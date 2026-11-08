import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/test/a11y';
import { RefuseOfferButton } from './RefuseOfferButton';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  refresh.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const lastBody = () => JSON.parse(fetchMock.mock.lastCall![1].body as string);

const REASONS = [
  { id: '1', type: 'REFUSAL_REASON', code: 'SALARY_TOO_LOW', label: 'Salary too low', meta: {} },
  { id: '2', type: 'REFUSAL_REASON', code: 'OTHER', label: 'Other', meta: { requiresNote: true } },
];

async function open() {
  render(<RefuseOfferButton applicationId="app-1" />);
  fetchMock.mockResolvedValueOnce(json(200, { data: REASONS }));
  await userEvent.click(screen.getByRole('button', { name: 'Refuse this offer' }));
  await waitFor(() => expect(screen.getByRole('combobox', { name: /Reason/ })).toBeInTheDocument());
  await waitFor(() =>
    expect(screen.getByRole('option', { name: 'Salary too low' })).toBeInTheDocument(),
  );
  return screen.getByRole('dialog');
}

describe('RefuseOfferButton', () => {
  it('sends a master-data reasonCode (not free text) when refusing an offer', async () => {
    const dialog = await open();
    await expectNoA11yViolations(dialog);
    fetchMock.mockResolvedValueOnce(json(200, { data: {} }));

    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: /Reason/ }),
      'SALARY_TOO_LOW',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Refuse Offer' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.lastCall!;
    expect(url).toBe('/api/v1/applications/app-1/refuse');
    expect(init.method).toBe('POST');
    expect(lastBody()).toMatchObject({ reasonCode: 'SALARY_TOO_LOW' });
    expect(lastBody()).not.toHaveProperty('reason');
  });

  it('requires a note for reasons whose meta requires one', async () => {
    await open();
    fetchMock.mockResolvedValueOnce(json(200, { data: {} }));

    await userEvent.selectOptions(screen.getByRole('combobox', { name: /Reason/ }), 'OTHER');
    const submit = screen.getByRole('button', { name: 'Refuse Offer' });
    expect(submit).toBeDisabled();
    expect(screen.getByLabelText(/required for this reason/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/required for this reason/), 'Too far');
    expect(submit).toBeEnabled();
    await userEvent.click(submit);

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(lastBody()).toMatchObject({ reasonCode: 'OTHER', note: 'Too far' });
  });

  it('offers a retry when the reason list fails to load', async () => {
    render(<RefuseOfferButton applicationId="app-1" />);
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await userEvent.click(screen.getByRole('button', { name: 'Refuse this offer' }));
    await waitFor(() =>
      expect(screen.getByText(/Could not load the list of reasons/)).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Refuse Offer' })).toBeDisabled();

    fetchMock.mockResolvedValueOnce(json(200, { data: REASONS }));
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Salary too low' })).toBeInTheDocument(),
    );
  });
});
