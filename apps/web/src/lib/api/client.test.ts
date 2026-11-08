import { describe, expect, it } from 'vitest';
import { ApiClientError, friendlyApiError } from './client';

describe('friendlyApiError (H15)', () => {
  it('lists field issues instead of the generic "Invalid request body"', () => {
    const err = new ApiClientError(422, {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Invalid request body',
        issues: [
          { path: 'salaryMin', message: 'Must be less than salary max' },
          { path: 'items.0.skillCode', message: 'Choose an option from the list' },
        ],
        correlation_id: 'x',
      },
    });
    expect(friendlyApiError(err)).toBe(
      'salary min: Must be less than salary max · items › #1 › skill code: Choose an option from the list',
    );
  });

  it('falls back to the message when there are no issues', () => {
    const err = new ApiClientError(500, {
      error: {
        code: 'INTERNAL',
        message: 'Something went wrong on our side.',
        correlation_id: 'x',
      },
    });
    expect(friendlyApiError(err)).toBe('Something went wrong on our side.');
    expect(friendlyApiError(new ApiClientError(0, null))).toBe(
      'Something went wrong. Please try again.',
    );
    expect(friendlyApiError(new Error('boom'))).toBe('boom');
    expect(friendlyApiError('nope')).toBe('Something went wrong. Please try again.');
  });

  it('caps long issue lists with a count', () => {
    const issues = Array.from({ length: 7 }, (_, i) => ({ path: `f${i}`, message: 'bad' }));
    const err = new ApiClientError(422, {
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Invalid request body',
        issues,
        correlation_id: 'x',
      },
    });
    expect(friendlyApiError(err)).toContain('(+2 more)');
  });
});
