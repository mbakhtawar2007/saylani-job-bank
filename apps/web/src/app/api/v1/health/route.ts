import { HeadBucketCommand } from '@aws-sdk/client-s3';
import { apiHandler } from '@/domains/shared/http';
import { enforceRateLimitByIp } from '@/domains/shared/rate-limit';
import { sqlClient } from '@/lib/db';
import { env } from '@/lib/env';
import { runHealthChecks } from '@/lib/health/checks';
import { getRedis } from '@/lib/redis/client';
import { s3, S3_BUCKET } from '@/lib/s3/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Audit 2026-11-11 (L-15): the check result is cached for 5s — monitors
// poll every 30–60s, so a flood of hits is cheap instead of running DB +
// PostGIS + S3 + Redis checks every time. The cap is 60/min/IP (the e2e
// warm-up polls once a second while waiting for the server, so it still
// fits). Errors are exposed only in local dev, never in staging/prod.
let cached: { at: number; result: Awaited<ReturnType<typeof runHealthChecks>> } | null = null;
const HEALTH_CACHE_MS = 5_000;

// Raw (un-enveloped) body on purpose: load balancers and uptime monitors read it directly.
export const GET = apiHandler({
  auth: 'public',
  handler: async ({ ctx }) => {
    await enforceRateLimitByIp(ctx.ip, 'health-ip', { limit: 60, windowSeconds: 60 });
    const fresh = !cached || Date.now() - cached.at >= HEALTH_CACHE_MS;
    if (fresh) {
      const redis = getRedis();
      const result = await runHealthChecks(
        {
          database: async () => {
            await sqlClient`SELECT 1`;
          },
          postgis: async () => {
            const [row] = await sqlClient<
              { version: string }[]
            >`SELECT postgis_lib_version() AS version`;
            return row?.version;
          },
          storage: async () => {
            await s3.send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
          },
          redis: redis
            ? async () => {
                await redis.ping();
              }
            : null,
        },
        { version: process.env.APP_VERSION ?? '0.0.0', exposeErrors: env.NODE_ENV === 'development' },
      );
      cached = { at: Date.now(), result };
    }
    const result = cached!.result;
    return Response.json(result, { status: result.status === 'ok' ? 200 : 503 });
  },
});
