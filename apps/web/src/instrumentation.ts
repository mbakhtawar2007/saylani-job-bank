/**
 * Next.js instrumentation — `register()` runs once when the server starts
 * (Node.js runtime). It wires the daily job-expiry scheduler.
 *
 * Why in-process: the app runs as a single long-lived container on the VPS
 * (no Vercel/Netlify cron, no recorded deployment target for a `vercel.json`
 * cron, and the public URL is a temporary Cloudflare tunnel, so an external
 * caller such as a GitHub Actions cron would break whenever the tunnel URL
 * changes). The timer below needs no URL and no secret: it calls
 * `expirePastCloseJobs` directly, under a system context, so audit rows
 * record actorRole SYSTEM exactly like the maintenance route does.
 *
 * Safety: production only (dev / test servers never close jobs on a timer);
 * timers are unref'd so they cannot hold the process open at shutdown; a
 * failed sweep is logged, never throws, and retries at the next run; the
 * sweep itself is idempotent under concurrency (row lock + re-check), so a
 * second server instance firing at the same minute is harmless. The Super
 * Admin maintenance route (`POST /api/v1/admin/maintenance/expire-jobs`)
 * keeps working by hand. The sweep is NOT run per request.
 */
// The job barrel re-exports applicant-referrals, which pulls the Redis
// client (ioredis, Node-only) into the bundle — webpack fails the build on
// 'stream'/'crypto'/'dns'/'net'. Import the server-safe expiry module
// directly instead.
// eslint-disable-next-line no-restricted-imports
import { expirePastCloseJobs, msUntilNextExpiryRun } from '@/domains/job/expiry';
import { systemContext } from '@/domains/shared/audit';
import { logger } from '@/lib/logger';

const DAY_MS = 24 * 60 * 60 * 1000;

/** `register()` can run more than once per process (dev reloads) — schedule once. */
let scheduled = false;

async function runExpiry(): Promise<void> {
  try {
    const { expired, jobIds } = await expirePastCloseJobs(systemContext('expire-jobs-scheduler'));
    logger.info('scheduled job expiry ran', { expired, jobIds });
  } catch (err) {
    // Never crash the server for a failed sweep — it retries at the next
    // daily run, and the manual maintenance route still works by hand.
    logger.error('scheduled job expiry failed', { err });
  }
}

function scheduleDailyExpiry(): void {
  if (scheduled) return;
  scheduled = true;
  const delayMs = msUntilNextExpiryRun();
  logger.info('scheduled daily job expiry', {
    nextRunAt: new Date(Date.now() + delayMs).toISOString(),
  });
  const first = setTimeout(() => {
    void runExpiry();
    const daily = setInterval(() => void runExpiry(), DAY_MS);
    daily.unref();
  }, delayMs);
  first.unref();
}

export async function register(): Promise<void> {
  if (process.env.NODE_ENV !== 'production') return;
  scheduleDailyExpiry();
}
