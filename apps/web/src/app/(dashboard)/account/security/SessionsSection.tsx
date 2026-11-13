'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { LogOut, MonitorSmartphone } from 'lucide-react';
import { Button, StatusPill } from '@/components/atoms';
import { toast } from '@/components/molecules';
import { apiFetch, friendlyApiError } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format/date';

/** Shape of GET /api/v1/auth/sessions (dates arrive as ISO strings). */
interface ApiSession {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  current: boolean;
}

/** Best-effort "Chrome on Windows" label from a user-agent string. Unknown → "Unknown browser". */
function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return 'Unknown browser';
  const browser = userAgent.includes('Edg/')
    ? 'Edge'
    : userAgent.includes('Chrome/')
      ? 'Chrome'
      : userAgent.includes('Firefox/')
        ? 'Firefox'
        : userAgent.includes('Safari/') && !userAgent.includes('Chrome/')
          ? 'Safari'
          : 'Browser';
  const os = userAgent.includes('Android')
    ? 'Android'
    : userAgent.includes('iPhone') || userAgent.includes('iPad')
      ? 'iOS'
      : userAgent.includes('Windows')
        ? 'Windows'
        : userAgent.includes('Mac OS X')
          ? 'macOS'
          : userAgent.includes('Linux')
            ? 'Linux'
            : null;
  return os ? `${browser} on ${os}` : browser;
}

export function SessionsSection() {
  const router = useRouter();
  const [sessions, setSessions] = useState<ApiSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await apiFetch<{ sessions: ApiSession[] }>('/api/v1/auth/sessions');
      setSessions(data.sessions);
    } catch (err) {
      setError(friendlyApiError(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function revokeOne(session: ApiSession) {
    setRevokingId(session.id);
    try {
      await apiFetch(`/api/v1/auth/sessions/${session.id}`, { method: 'DELETE' });
      if (session.current) {
        // My own session is gone — the cookie no longer works.
        router.push('/login');
        router.refresh();
        return;
      }
      toast.success('Session signed out');
      await load();
    } catch (err) {
      toast.error(friendlyApiError(err));
    } finally {
      setRevokingId(null);
    }
  }

  async function revokeAll() {
    setRevokingAll(true);
    try {
      await apiFetch('/api/v1/auth/sessions/revoke-all', { method: 'POST', body: {} });
      // Every session — including this one — is revoked.
      router.push('/login');
      router.refresh();
    } catch (err) {
      toast.error(friendlyApiError(err));
      setRevokingAll(false);
      setConfirmAll(false);
    }
  }

  return (
    <div className="text-fg-muted grid gap-4 text-sm">
      <p>
        Every device signed in to your account. If you see a session you do not recognise, sign it
        out — or sign out everywhere.
      </p>

      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}

      {sessions === null && !error && <p>Loading sessions…</p>}

      {sessions !== null && sessions.length === 0 && (
        <p>No other sessions. This is your only sign-in.</p>
      )}

      {sessions !== null && sessions.length > 0 && (
        <ul className="grid gap-3">
          {sessions.map((session) => (
            <li
              key={session.id}
              className="border-border flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
            >
              <div className="grid gap-0.5">
                <p className="text-fg flex items-center gap-2 font-medium">
                  <MonitorSmartphone className="size-4 shrink-0" aria-hidden="true" />
                  {deviceLabel(session.userAgent)}
                  {session.current && <StatusPill label="This device" tone="success" />}
                </p>
                <p>
                  {session.ipAddress ? `${session.ipAddress} · ` : ''}Signed in{' '}
                  {formatDateTime(session.createdAt)}
                </p>
                <p>Last active {formatDateTime(session.lastActiveAt)}</p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                loading={revokingId === session.id}
                onClick={() => void revokeOne(session)}
              >
                Sign out
              </Button>
            </li>
          ))}
        </ul>
      )}

      {sessions !== null && sessions.length > 1 && (
        <div>
          {confirmAll ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setConfirmAll(false)}>
                Cancel
              </Button>
              <Button variant="danger" loading={revokingAll} onClick={() => void revokeAll()}>
                <LogOut aria-hidden="true" /> Yes, sign out everywhere
              </Button>
            </div>
          ) : (
            <Button
              variant="secondary"
              className="justify-self-start"
              onClick={() => setConfirmAll(true)}
            >
              <LogOut aria-hidden="true" /> Sign out everywhere
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
