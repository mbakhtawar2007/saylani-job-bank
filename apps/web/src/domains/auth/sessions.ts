import 'server-only';
import { z } from 'zod';
import { schema } from '@jobbank/db';
import { and, desc, eq } from 'drizzle-orm';
import { recordAudit, type RequestContext } from '@/domains/shared/audit';
import { NotFoundError } from '@/domains/shared/errors';
import { db } from '@/lib/db';
import { getAuth } from './auth';
import { revokeAllSessions } from './service';

/**
 * Session inventory: what the user sees on the Security page.
 *
 * The Better Auth `sessions` table has no separate "last active" column, so
 * `lastActiveAt` is `updatedAt` — Better Auth refreshes it when the session
 * is extended. `createdAt` is the sign-in time. The raw session token is
 * never returned (the id alone is enough to revoke).
 */
export interface SessionView {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
  current: boolean;
}

export const sessionViewSchema = z.object({
  id: z.string().uuid(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.date(),
  lastActiveAt: z.date(),
  expiresAt: z.date(),
  current: z.boolean(),
});

export const sessionListSchema = z.object({ sessions: z.array(sessionViewSchema) });

/** The id of the session behind `headers` (null when there is none). */
export async function getCurrentSessionId(headers: Headers): Promise<string | null> {
  const session = await getAuth().api.getSession({ headers });
  return session?.session.id ?? null;
}

/** All of the user's sessions, newest activity first, current one flagged. */
export async function listMySessions(
  userId: string,
  currentSessionId: string | null,
): Promise<SessionView[]> {
  const rows = await db
    .select({
      id: schema.sessions.id,
      ipAddress: schema.sessions.ipAddress,
      userAgent: schema.sessions.userAgent,
      createdAt: schema.sessions.createdAt,
      updatedAt: schema.sessions.updatedAt,
      expiresAt: schema.sessions.expiresAt,
    })
    .from(schema.sessions)
    .where(eq(schema.sessions.userId, userId))
    .orderBy(desc(schema.sessions.updatedAt));
  return rows.map((row) => ({
    id: row.id,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    createdAt: row.createdAt,
    lastActiveAt: row.updatedAt,
    expiresAt: row.expiresAt,
    current: row.id === currentSessionId,
  }));
}

/**
 * Revokes one of the user's own sessions. The id is scoped to the user, so
 * one user can never revoke another's session. Revoking the session the
 * caller is using signs them out — the UI redirects to /login afterwards.
 */
export async function revokeMySession(
  ctx: RequestContext,
  userId: string,
  sessionId: string,
): Promise<void> {
  const removed = await db
    .delete(schema.sessions)
    .where(and(eq(schema.sessions.id, sessionId), eq(schema.sessions.userId, userId)))
    .returning({ id: schema.sessions.id });
  if (removed.length === 0) throw new NotFoundError('Session');
  await recordAudit(ctx, {
    action: 'auth.session_revoked',
    entityType: 'user',
    entityId: userId,
    metadata: { sessionId },
  });
}

/**
 * Signs the user out everywhere. Reuses the shared revokeAllSessions helper
 * (the same one password reset / disable / 2FA reset use) instead of
 * reimplementing revocation. The caller's own session is revoked too — the
 * UI redirects to /login afterwards.
 */
export async function revokeAllMySessions(ctx: RequestContext, userId: string): Promise<void> {
  await revokeAllSessions(userId);
  await recordAudit(ctx, {
    action: 'auth.sessions_revoked_all',
    entityType: 'user',
    entityId: userId,
  });
}
