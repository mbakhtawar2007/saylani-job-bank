import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstantListFilters } from './InstantListFilters';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

const companies = [
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'UNDER_VERIFICATION', label: 'Under Review' },
  { value: 'INFO_REQUESTED', label: 'Info needed' },
  { value: 'REJECTED', label: 'Rejected' },
] as const;
const jobs = [
  { value: 'OPEN', label: 'Open' },
  { value: 'PAUSED', label: 'Paused' },
] as const;

beforeEach(() => {
  vi.useFakeTimers();
  replace.mockReset();
  window.history.replaceState(
    {},
    '',
    '/branch-admin/companies?q=old&status=VERIFIED&page=3&pageSize=5&sort=legalName%3Aasc',
  );
});
afterEach(() => {
  vi.useRealTimers();
});

describe('instant list filters', () => {
  it('debounces rapid company search and preserves status, sort and page size', () => {
    render(
      <InstantListFilters
        action="/branch-admin/companies"
        query="q=old&status=VERIFIED&page=3&pageSize=5&sort=legalName%3Aasc"
        label="companies"
        statuses={companies}
        defaultStatus="VERIFIED"
      />,
    );
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Verified',
      'Suspended',
      'Under Review',
      'Info needed',
      'Rejected',
    ]);
    expect(screen.queryByRole('button', { name: /apply|search/i })).not.toBeInTheDocument();
    const search = screen.getByLabelText('Search companies');
    fireEvent.change(search, { target: { value: 'a' } });
    act(() => vi.advanceTimersByTime(200));
    fireEvent.change(search, { target: { value: 'acme' } });
    act(() => vi.advanceTimersByTime(349));
    expect(replace).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenLastCalledWith(
      '/branch-admin/companies?q=acme&status=VERIFIED&pageSize=5&sort=legalName%3Aasc',
      { scroll: false },
    );
  });

  it('applies status immediately with the latest unsubmitted search and cancels stale timers', () => {
    render(
      <InstantListFilters
        action="/branch-admin/companies"
        query="q=old&status=VERIFIED&page=3"
        label="companies"
        statuses={companies}
        defaultStatus="VERIFIED"
      />,
    );
    fireEvent.change(screen.getByLabelText('Search companies'), { target: { value: 'new' } });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'SUSPENDED' } });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace.mock.calls[0]![0]).toContain('q=new&status=SUSPENDED');
    expect(replace.mock.calls[0]![0]).not.toContain('page=3');
    act(() => vi.advanceTimersByTime(1000));
    expect(replace).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText('Search companies'), { target: { value: '' } });
    act(() => vi.advanceTimersByTime(350));
    const url = new URL(replace.mock.calls[1]![0], 'http://localhost');
    expect(url.searchParams.get('status')).toBe('SUSPENDED');
    expect(url.searchParams.has('q')).toBe(false);
  });

  it('retains the jobs all-status option and synchronizes browser history', () => {
    window.history.replaceState({}, '', '/branch-admin/jobs?q=design&status=OPEN&page=2');
    render(
      <InstantListFilters
        action="/branch-admin/jobs"
        query="q=design&status=OPEN&page=2"
        label="jobs"
        statuses={jobs}
        allowAllStatuses
      />,
    );
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'All statuses',
      'Open',
      'Paused',
    ]);
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: '' } });
    expect(replace.mock.calls[0]![0]).toBe('/branch-admin/jobs?q=design');
    window.history.replaceState({}, '', '/branch-admin/jobs?q=older&status=PAUSED');
    fireEvent.popState(window);
    expect(screen.getByLabelText('Search jobs')).toHaveValue('older');
    expect(screen.getByLabelText('Status')).toHaveValue('PAUSED');
  });
});
