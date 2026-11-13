'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/atoms';
import { ErrorBanner } from '@/components/molecules';
import { ApiClientError, apiFetch } from '@/lib/api/client';
import { PasswordFields, passwordReady } from '../_PasswordFields';

export function AcceptInviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  /** The server's message for the password field, if it reported one. */
  const passwordError = error instanceof ApiClientError ? error.issueFor('password') : undefined;

  return (
    <form
      className="grid gap-4"
      noValidate
      onSubmit={async (event) => {
        event.preventDefault();
        setTouched(true);
        if (!passwordReady(password, confirm)) return;
        setPending(true);
        setError(null);
        try {
          const { data } = await apiFetch<{ kind: string; homePath?: string }>(
            '/api/v1/auth/invitations/accept',
            {
              method: 'POST',
              body: { token, password },
            },
          );
          router.replace(data.kind === 'signed_in' && data.homePath ? data.homePath : '/login');
          router.refresh();
        } catch (err) {
          setError(err);
          setPending(false);
        }
      }}
    >
      <PasswordFields
        password={password}
        confirm={confirm}
        onPassword={setPassword}
        onConfirm={setConfirm}
        showErrors={touched}
        serverError={passwordError}
      />
      <ErrorBanner error={error ?? undefined} operation="Activate account" />
      <Button type="submit" fullWidth loading={pending}>
        Activate my account
      </Button>
    </form>
  );
}
