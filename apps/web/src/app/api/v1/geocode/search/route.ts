import { listMasterData } from '@/domains/settings';
import { apiHandler, ok } from '@/domains/shared/http';
import { enforceRateLimit, enforceRateLimitByIp } from '@/domains/shared/rate-limit';
import { searchGeocode, searchGeocodeQuery } from '@/lib/geocode/search';

/**
 * GET /api/v1/geocode/search?q=Gulshan-e-Iqbal — search area or landmark in Pakistan.
 * Returns coordinates, formatted address line, and matching cityCode from master data.
 *
 * Public by design (map pin pickers), so it is limited rather than authenticated:
 * 60/min per IP and 60/min per signed-in user. Every cache miss fans out to the
 * paid OpenCage API, then Photon, then Nominatim — an unlimited endpoint is a
 * quota-exhaustion and SMS-style cost hole.
 */
export const GET = apiHandler({
  auth: 'public',
  query: searchGeocodeQuery,
  handler: async ({ actor, ctx, query }) => {
    await enforceRateLimitByIp(ctx.ip, 'geocode-search-ip', { limit: 60, windowSeconds: 60 });
    if (actor) {
      await enforceRateLimit('geocode-search-user', actor.userId, {
        limit: 60,
        windowSeconds: 60,
      });
    }
    let cities: { code: string; label: string }[] = [];
    if (actor) {
      try {
        cities = (await listMasterData(actor, { type: 'CITY' })).map((c) => ({
          code: c.code,
          label: c.label,
        }));
      } catch {
        // Fallback if master data lookup fails
      }
    }
    const results = await searchGeocode(query.q, cities);
    return ok(results);
  },
});
