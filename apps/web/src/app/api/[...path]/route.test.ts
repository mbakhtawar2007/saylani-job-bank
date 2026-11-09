import { apiErrorSchema } from '@jobbank/shared';
import { describe, expect, it, vi } from 'vitest';
import { resolveActor } from '@/domains/shared/http';
import { GET, POST } from './route';

vi.mock('@/domains/shared/http/actor', () => ({ resolveActor: vi.fn() }));
const mockedActor = vi.mocked(resolveActor);

const noParams = { params: Promise.resolve({ path: ['v1', 'bogus'] }) };

describe('unknown API routes (F5)', () => {
  it('GET returns the JSON NOT_FOUND envelope, not an HTML 404', async () => {
    mockedActor.mockResolvedValue(null);
    const res = await GET(new Request('http://localhost/api/v1/bogus'), noParams);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = await res.json();
    expect(apiErrorSchema.parse(body).error.code).toBe('NOT_FOUND');
    expect(body.error.message).toContain('/api/v1/bogus');
  });

  it('POST to an unknown path 404s the same way', async () => {
    mockedActor.mockResolvedValue(null);
    const res = await POST(
      new Request('http://localhost/api/v1/bogus', { method: 'POST' }),
      noParams,
    );
    expect(res.status).toBe(404);
    expect(apiErrorSchema.parse(await res.json()).error.code).toBe('NOT_FOUND');
  });
});
