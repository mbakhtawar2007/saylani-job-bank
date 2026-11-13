/**
 * Next.js instrumentation — `register()` runs once when the server starts
 * (Node.js runtime). It wires the daily job-expiry scheduler.
 *
 * Why in-process + HTTP self-call: the app runs as a single long-lived container on the VPS
 * (no Vercel/Netlify cron, no recorded deployment target for a `vercel.json` cron, and the
 * public URL is a temporary Cloudflare tunnel, so an external caller such as a GitHub Actions
 * cron would break whenever the tunnel URL changes). The timer below calls the maintenance
 * route (`POST /api/v1/admin/maintenance/expire-jobs`) over the container loopback
 * (`http://127.0.0.1:3000/...`) — the same loopback the web container's own healthcheck
 * already uses — authenticated with the shared `CRON_SECRET` in the `x-cron-secret` header,
 * exactly like an external cron would. The route runs the sweep under a system context, so
 * audit rows record actorRole SYSTEM.
 *
 * Why NOT a direct import: Next bundles `instrumentation.ts` for the Edge runtime too
 * (this app has `src/middleware.ts`, so the edge instrumentation entry is never dropped),
 * and the Edge runtime has no Node builtins. Any static import reaching a Node-only driver
 * — `ioredis` via the job barrel, `postgres` via `@jobbank/db` — fails the build with
 * "Module not found: Can't resolve 'net'/'tls'/...". So this file's static import graph must
 * stay free of Node-only code: only the edge-safe logger (pure TS + console, via
 * `@/lib/privacy/redact`) and the global `fetch` are used, and the schedule math is inlined
 * below. Keep the run time in sync with `EXPIRY_RUN_HOUR_UTC` / `EXPIRY_RUN_MINUTE_UTC` in
 * `apps/web/src/domains/job/expiry.ts`.
 *
 * Edge runtime (2026-11-13 outage): because this app has `src/middleware.ts`, Next also
 * bundles this file for the Edge runtime and calls `register()` there on every request.
 * The Edge runtime's `setTimeout` returns a plain number — it has no `.unref()` — so the
 * `setTimeout(...).unref()` calls below threw `TypeError: setTimeout(...).unref is not a
 * function` while loading the instrumentation hook, and every request through middleware
 * (/, /login, /api/v1/health) returned 500. The scheduler therefore runs ONLY when
 * `process.env.NEXT_RUNTIME === 'nodejs'`; in Edge `register()` returns immediately.
 *
 * Safety: Node runtime + production only (dev / test servers never close jobs on a timer); timers are
 * unref'd so they cannot hold the process open at shutdown; a failed sweep is logged, never
 * throws, and retries at the next run; the sweep itself is idempotent under concurrency
 * (row lock + re-check), so a second server instance firing at the same minute is harmless.
 * If `CRON_SECRET` is unset, the scheduler is NOT started at all (one clear warning is
 * logged) — an unauthenticated call would just 401, and the Super Admin maintenance route
 * (`POST /api/v1/admin/maintenance/expire-jobs`) keeps working by hand. The sweep is NOT
 * run per request.
 */
import { logger } from '@/lib/logger';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Keep in sync with EXPIRY_RUN_HOUR_UTC / EXPIRY_RUN_MINUTE_UTC in domains/job/expiry.ts. */
const EXPIRY_RUN_HOUR_UTC = 19;
const EXPIRY_RUN_MINUTE_UTC = 5;

/** Loopback URL — same host/port the web container's own healthcheck uses. */
const EXPIRE_URL = 'http://127.0.0.1:3000/api/v1/admin/maintenance/expire-jobs';

/**
 * Milliseconds from `now` until the next daily expiry run (19:05 UTC).
 * Pure, so the schedule is unit-testable without timers. A `now` exactly
 * on the run time waits until tomorrow — the run itself is idempotent, but
 * scheduling a 0ms first run after a restart would double-fire with the
 * manual route if an admin happened to run it at the same minute.
 * (Same math as `msUntilNextExpiryRun` in domains/job/expiry.ts, inlined
 * here so this file imports no database code — see the header comment.)
 */
function msUntilNextExpiryRun(now: Date = new Date()): number {
  const next = new Date(now);
  next.setUTCHours(EXPIRY_RUN_HOUR_UTC, EXPIRY_RUN_MINUTE_UTC, 0, 0);
  if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

/** `register()` can run more than once per process (dev reloads) — schedule once. */
let scheduled = false;

async function runExpiry(secret: string): Promise<void> {
  try {
    const res = await fetch(EXPIRE_URL, {
      method: 'POST',
      headers: { 'x-cron-secret': secret },
    });
    if (!res.ok) {
      // Never crash the server for a failed sweep — it retries at the next
      // daily run, and the manual maintenance route still works by hand.
      logger.error('scheduled job expiry failed', { status: res.status });
      return;
    }
    // The route's envelope is `{ data: { expired, jobIds } }` — parse it
    // defensively; a missing or unparseable body is not a failure, the
    // HTTP status is the signal.
    let expired: unknown;
    let jobIds: unknown;
    try {
      const body = (await res.json()) as Record<string, unknown>;
      const data = (body.data ?? body) as Record<string, unknown>;
      expired = data.expired;
      jobIds = data.jobIds;
    } catch {
      // Ignore parse errors — the sweep already ran (200).
    }
    logger.info('scheduled job expiry ran', { expired, jobIds });
  } catch (err) {
    // Never crash the server for a failed sweep — it retries at the next
    // daily run, and the manual maintenance route still works by hand.
    logger.error('scheduled job expiry failed', { err });
  }
}

function scheduleDailyExpiry(secret: string): void {
  if (scheduled) return;
  scheduled = true;
  const delayMs = msUntilNextExpiryRun();
  logger.info('scheduled daily job expiry', {
    nextRunAt: new Date(Date.now() + delayMs).toISOString(),
  });
  const first = setTimeout(() => {
    void runExpiry(secret);
    const daily = setInterval(() => void runExpiry(secret), DAY_MS);
    daily.unref();
  }, delayMs);
  first.unref();
}

export async function register(): Promise<void> {
  // Edge runtime: Next bundles this file for Edge too (middleware exists) and calls
  // register() there. Edge timers have no .unref() — scheduling here 500s every
  // request (2026-11-13). The scheduler is a Node-only concern.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NODE_ENV !== 'production') return;
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.warn(
      'CRON_SECRET is not set — daily job expiry scheduler not started; close past-date jobs from the Super Admin maintenance route',
    );
    return;
  }
  scheduleDailyExpiry(secret);
}
