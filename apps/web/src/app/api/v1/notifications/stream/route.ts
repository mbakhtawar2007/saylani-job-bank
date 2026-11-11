import { getAuthState } from '@/domains/auth';
import { getNewNotificationsSince } from '@/domains/notifications';

// Poll interval in ms. Kept short enough for a responsive feel without hammering the DB.
const POLL_MS = 8_000;
// Close the stream after 5 min so load-balancers don't hold connections forever;
// the client reconnects automatically via EventSource's built-in retry.
const MAX_DURATION_MS = 5 * 60 * 1_000;

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/notifications/stream
 * Server-Sent Events (SSE) stream for real-time notification pushes.
 * Query param: `since` (ISO timestamp) — only events after this point are sent.
 */
export async function GET(request: Request) {
  const auth = await getAuthState(request.headers);
  if (auth.status !== 'active') {
    return new Response('Unauthorized', { status: 401 });
  }
  // Audit 2026-11-11 (L-28): the stream bypassed the two-factor-pending
  // gate every other route enforces — an admin who hasn't enrolled 2FA
  // could still receive their notifications here. Same check as apiHandler.
  if (auth.actor.twoFactorPending) {
    return new Response('Forbidden', { status: 403 });
  }
  const { userId } = auth.actor;

  const url = new URL(request.url);
  const sinceParam = url.searchParams.get('since');
  // Audit 2026-11-10 (M3): an unparseable `since` used to become an
  // Invalid Date passed straight into the DB query. Reject it up front.
  let cursor = new Date();
  if (sinceParam) {
    const parsed = new Date(sinceParam);
    if (Number.isNaN(parsed.getTime())) {
      return Response.json(
        { error: { code: 'VALIDATION', message: 'Query param "since" must be an ISO timestamp' } },
        { status: 400 },
      );
    }
    cursor = parsed;
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const started = Date.now();

      function send(event: string, data: unknown) {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      }

      // Send a heartbeat immediately so the client knows the connection is open.
      send('ping', { ts: new Date().toISOString() });

      while (Date.now() - started < MAX_DURATION_MS) {
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));

        // Stop if the client disconnected.
        if (request.signal.aborted) break;

        try {
          const items = await getNewNotificationsSince(userId, cursor);
          if (items.length > 0) {
            // Audit 2026-11-11 (L-30): advance to the OLDEST returned
            // item, not the newest — the query caps at 20 rows, so a
            // newest-first cursor silently dropped anything past 20 in one
            // window. (Duplicates from the overlap only re-trigger a page
            // refresh on the client; nothing renders twice.) One residual
            // edge: rows sharing one createdAt timestamp past the cap can
            // still be missed — paging by id would close that too.
            cursor = items[items.length - 1]!.createdAt;
            send('notifications', items);
          } else {
            send('ping', { ts: new Date().toISOString() });
          }
        } catch {
          // DB hiccups are silent — the client retries via EventSource.
          send('ping', { ts: new Date().toISOString() });
        }
      }

      controller.close();
    },
    cancel() {
      // Client disconnected early — nothing to clean up.
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // disable nginx buffering
    },
  });
}
