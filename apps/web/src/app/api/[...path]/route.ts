import { apiHandler } from '@/domains/shared/http';
import { NotFoundError } from '@/domains/shared/errors';

export const dynamic = 'force-dynamic';

/**
 * F5: unknown /api/... paths return the PRD §8 JSON error envelope
 * (`{ error: { code: 'NOT_FOUND', message, correlation_id } }`, 404)
 * instead of Next.js's HTML 404 page. Next.js routes the most specific
 * match first, so every real /api/v1/... route still wins over this
 * catch-all; only unmatched paths land here. Public by design: an unknown
 * path must 404 the same way for signed-out callers instead of 401ing,
 * which would leak whether a path exists.
 */
const unknownApiRoute = apiHandler({
  auth: 'public',
  handler: async ({ request }) => {
    throw new NotFoundError('Route', new URL(request.url).pathname);
  },
});

export const GET = unknownApiRoute;
export const POST = unknownApiRoute;
export const PUT = unknownApiRoute;
export const PATCH = unknownApiRoute;
export const DELETE = unknownApiRoute;
