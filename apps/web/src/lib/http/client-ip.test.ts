import { describe, expect, it } from 'vitest';
import { clientIpFrom } from './client-ip';

function headers(entries: Record<string, string>): Headers {
  return new Headers(entries);
}

describe('clientIpFrom', () => {
  it('takes the single entry with one trusted proxy', () => {
    expect(clientIpFrom(headers({ 'x-forwarded-for': '203.0.113.7' }), 1)).toBe('203.0.113.7');
  });

  it('takes the right-hand entries only: a spoofed left entry is ignored', () => {
    // Client forged "1.2.3.4" at the left; two real proxies appended the rest.
    expect(clientIpFrom(headers({ 'x-forwarded-for': '1.2.3.4, 203.0.113.7, 10.0.0.1' }), 2)).toBe(
      '203.0.113.7',
    );
  });

  it('returns null when the chain is shorter than the trusted proxy count', () => {
    // One entry with two trusted proxies: it could be the client, or the first
    // proxy — indistinguishable, so trust neither (fail closed, never the leftmost).
    expect(clientIpFrom(headers({ 'x-forwarded-for': '203.0.113.7' }), 2)).toBeNull();
  });

  it('returns null with no forwarded headers at all', () => {
    expect(clientIpFrom(headers({}), 1)).toBeNull();
  });

  it('never trusts X-Real-IP, even on its own', () => {
    expect(clientIpFrom(headers({ 'x-real-ip': '203.0.113.7' }), 1)).toBeNull();
    expect(
      clientIpFrom(headers({ 'x-forwarded-for': '198.51.100.9', 'x-real-ip': '203.0.113.7' }), 1),
    ).toBe('198.51.100.9');
  });
});
