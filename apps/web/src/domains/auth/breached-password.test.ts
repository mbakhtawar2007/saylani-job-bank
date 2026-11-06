import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

const { assertPasswordNotBreached, isPasswordBreached } = await import('./breached-password');

/** A stub fetch that records requested URLs and answers with the given range body. */
function stubFetch(body: string, ok = true) {
  const urls: string[] = [];
  const fetchImpl = vi.fn(async (input: unknown) => {
    urls.push(String(input));
    return { ok, status: ok ? 200 : 503, text: async () => body };
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, urls };
}

function suffixFor(password: string): string {
  return createHash('sha1').update(password).digest('hex').toUpperCase().slice(5);
}

describe('isPasswordBreached (HIBP k-anonymity)', () => {
  it('sends only the first 5 hash chars and matches the suffix locally', async () => {
    const { fetchImpl, urls } = stubFetch(
      `${suffixFor('password')}:9547375\n00C960BB87997DA398D1A0FBFE8043EBB70:2\n`,
    );
    expect(await isPasswordBreached('password', fetchImpl)).toBe(true);
    // The well-known SHA-1 prefix of "password" — and nothing more of the hash.
    expect(urls[0]).toBe('https://api.pwnedpasswords.com/range/5BAA6');
    expect(urls[0]).not.toContain(suffixFor('password'));
  });

  it('returns false when the suffix is absent from the range', async () => {
    const { fetchImpl } = stubFetch('00C960BB87997DA398D1A0FBFE8043EBB70:2\n');
    expect(await isPasswordBreached('correct horse battery staple', fetchImpl)).toBe(false);
  });

  it('fails OPEN on a network error (never locks users out on an HIBP outage)', async () => {
    const failing = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    expect(await isPasswordBreached('password', failing)).toBe(false);
  });

  it('fails OPEN on a non-2xx response', async () => {
    expect(await isPasswordBreached('password', stubFetch('', false).fetchImpl)).toBe(false);
  });

  it('fails OPEN on a malformed body', async () => {
    expect(await isPasswordBreached('password', stubFetch('not-a-range-body').fetchImpl)).toBe(
      false,
    );
  });
});

describe('assertPasswordNotBreached', () => {
  it('throws a password ValidationError for a breached password', async () => {
    const { fetchImpl } = stubFetch(`${suffixFor('password')}:3\n`);
    await expect(assertPasswordNotBreached('password', fetchImpl)).rejects.toMatchObject({
      issues: [{ path: 'password' }],
    });
  });

  it('passes a clean password through', async () => {
    await expect(
      assertPasswordNotBreached('correct horse battery staple', stubFetch('').fetchImpl),
    ).resolves.toBeUndefined();
  });
});
