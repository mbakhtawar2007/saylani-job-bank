'use client';

import { CircleCheck } from 'lucide-react';
import NextLink from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/atoms';
import { ErrorBanner } from '@/components/molecules';
import { ApiClientError, apiFetch } from '@/lib/api/client';
import { PasswordFields, passwordReady } from '../_PasswordFields';

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  /** The server's message for the password field, if it reported one. */
  const passwordError = error instanceof ApiClientError ? error.issueFor('password') : undefined;
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <p role="alert" className="text-danger text-sm">
        This link is missing its code. Open the link from your email again.
      </p>
    );
  }
  if (done) {
    return (
      <div className="grid gap-4">
        <p role="status" className="text-fg flex items-center gap-2 text-sm">
          <CircleCheck className="text-success size-5" aria-hidden="true" /> Your password has been
          changed.
        </p>
        <Button asChild fullWidth>
          <NextLink href="/login">Sign in</NextLink>
        </Button>
      </div>
    );
  }
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
          await apiFetch('/api/v1/auth/password/reset', {
            method: 'POST',
            body: { token, password },
          });
          setDone(true);
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
      <ErrorBanner error={error ?? undefined} operation="Save new password">
        {error instanceof ApiClientError && error.message.includes('expired') && (
          <NextLink href="/forgot-password" className="underline">
            Request a new link
          </NextLink>
        )}
      </ErrorBanner>
      <Button type="submit" fullWidth loading={pending}>
        Save new password
      </Button>
    </form>
  );
}
