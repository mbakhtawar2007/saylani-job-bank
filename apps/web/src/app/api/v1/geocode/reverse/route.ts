import { listMasterData } from '@/domains/settings';
import { apiHandler, ok } from '@/domains/shared/http';
import { enforceRateLimit, enforceRateLimitByIp } from '@/domains/shared/rate-limit';
import { reverseGeocode, reverseGeocodeQuery } from '@/lib/geocode/reverse';

/**
 * GET /api/v1/geocode/reverse?lat=24.86&lng=67.00 — map pin → address line +
 * city code (matched against CITY master data). Any signed-in user; used by
 * the employer job form to autofill the location after placing a pin.
 *
 * Public by design, so it is limited rather than authenticated: 60/min per IP
 * and 60/min per signed-in user (see the search route — same reasoning).
 */
export const GET = apiHandler({
  auth: 'public',
  query: reverseGeocodeQuery,
  handler: async ({ actor, ctx, query }) => {
    await enforceRateLimitByIp(ctx.ip, 'geocode-reverse-ip', { limit: 60, windowSeconds: 60 });
    if (actor) {
      await enforceRateLimit('geocode-reverse-user', actor.userId, {
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
        // Fallback
      }
    }
    return ok(await reverseGeocode(query.lat, query.lng, cities));
  },
});
