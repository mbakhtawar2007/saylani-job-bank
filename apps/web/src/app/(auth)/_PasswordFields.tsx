'use client';

import { PASSWORD_HINT, passwordSchema } from '@jobbank/shared';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { useState } from 'react';
import { Input } from '@/components/atoms';
import { FormField } from '@/components/molecules';

/** New password + confirmation, validated with the same rules as the API. */
export function PasswordFields({
  password,
  confirm,
  onPassword,
  onConfirm,
  showErrors,
  serverError,
}: {
  password: string;
  confirm: string;
  onPassword: (v: string) => void;
  onConfirm: (v: string) => void;
  showErrors: boolean;
  /**
   * The API's message for the password field (e.g. a server validation
   * message), shown on the password field itself instead of as a generic
   * banner. Wins over the local policy error when present.
   */
  serverError?: string;
}) {
  const policy = passwordSchema.safeParse(password);
  const policyError = showErrors && !policy.success ? policy.error.issues[0]?.message : undefined;
  const mismatch = showErrors && confirm !== password ? 'Passwords do not match' : undefined;
  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  return (
    <>
      <FormField
        label="New password"
        required
        hint={PASSWORD_HINT}
        error={serverError ?? policyError}
      >
        <Input
          type={showPw ? 'text' : 'password'}
          autoComplete="new-password"
          value={password}
          onChange={(e) => onPassword(e.target.value)}
          startAdornment={<Lock aria-hidden="true" />}
          endAdornment={
            <button
              type="button"
              aria-label={showPw ? 'Hide password' : 'Show password'}
              onClick={() => setShowPw((v) => !v)}
              className="text-fg-muted"
            >
              {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          }
        />
      </FormField>
      <FormField label="Confirm new password" required error={mismatch}>
        <Input
          type={showConfirmPw ? 'text' : 'password'}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => onConfirm(e.target.value)}
          startAdornment={<Lock aria-hidden="true" />}
          endAdornment={
            <button
              type="button"
              aria-label={showConfirmPw ? 'Hide password' : 'Show password'}
              onClick={() => setShowConfirmPw((v) => !v)}
              className="text-fg-muted"
            >
              {showConfirmPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          }
        />
      </FormField>
    </>
  );
}

export const passwordReady = (password: string, confirm: string) =>
  passwordSchema.safeParse(password).success && password === confirm;
