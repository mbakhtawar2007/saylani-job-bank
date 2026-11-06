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

// Raw (un-enveloped) body on purpose: load balancers and uptime monitors read it directly.
export const GET = apiHandler({
  auth: 'public',
  handler: async ({ ctx }) => {
    // Each hit runs DB + PostGIS + S3 + Redis checks, so an unauthenticated flood is
    // a cheap DoS. 300/min per IP is generous for monitors (typically every 30–60s)
    // and for the e2e warm-up, which polls every second from a shared bucket while
    // it waits for the server — and still caps a flood at 5 checks/second.
    await enforceRateLimitByIp(ctx.ip, 'health-ip', { limit: 300, windowSeconds: 60 });
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
      { version: process.env.APP_VERSION ?? '0.0.0', exposeErrors: env.NODE_ENV !== 'production' },
    );
    return Response.json(result, { status: result.status === 'ok' ? 200 : 503 });
  },
});
