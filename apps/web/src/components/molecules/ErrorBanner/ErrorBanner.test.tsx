import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '@/lib/api/client';
import { ErrorBanner } from './ErrorBanner';

describe('ErrorBanner', () => {
  it('shows a 422 as a validation list, field by field', () => {
    const err = new ApiClientError(422, {
      error: {
        code: 'VALIDATION_FAILED',
        message:
          'Please fix 2 fields: Password — Use at least 10 characters, including a letter and a number.',
        issues: [
          {
            path: 'password',
            message: 'Use at least 10 characters, including a letter and a number.',
          },
          { path: 'code', message: 'Enter the 6-digit code' },
        ],
        correlation_id: 'corr-1',
      },
    });
    render(<ErrorBanner error={err} operation="Create account" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Please fix these 2 fields');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Password — Use at least 10 characters, including a letter and a number.',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Code — Enter the 6-digit code');
    // A validation banner is not a system error: no code/status/reference.
    expect(screen.getByRole('alert')).not.toHaveTextContent('Ref:');
  });

  it('jumps to the field when a validation item is clicked', async () => {
    const onIssueClick = vi.fn();
    render(
      <ErrorBanner
        variant="validation"
        issues={[{ path: 'password', message: 'Choose a different password' }]}
        onIssueClick={onIssueClick}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Password/ }));
    expect(onIssueClick).toHaveBeenCalledWith('password');
  });

  it('shows a 500 in red with code, status and correlation reference — and no internals', () => {
    const err = new ApiClientError(500, {
      error: {
        code: 'INTERNAL',
        message: 'Something went wrong on our side. Please try again.',
        correlation_id: 'corr-abc-123',
      },
    });
    render(<ErrorBanner error={err} operation="Save job" />);
    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent('Save job failed');
    expect(banner).toHaveTextContent('Code: INTERNAL');
    expect(banner).toHaveTextContent('Status: 500');
    expect(banner).toHaveTextContent('Ref: corr-abc-123');
    expect(banner).toHaveTextContent('share the reference above with support');
    expect(banner.className).toContain('bg-danger-soft');
  });

  it('shows a network failure as a system error with what to do next', () => {
    render(<ErrorBanner error={new ApiClientError(0, null)} operation="Sign in" />);
    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent('Sign in failed');
    expect(banner).toHaveTextContent('Cannot reach the server');
    expect(banner).toHaveTextContent('Check your internet connection');
  });

  it('shows a success in green, naming what completed', () => {
    render(<ErrorBanner variant="success" message="Job saved as draft" />);
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('Job saved as draft');
    expect(banner.className).toContain('bg-success-soft');
  });

  it('renders nothing with no error, message, issues or children', () => {
    const { container } = render(<ErrorBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});
