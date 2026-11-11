import type { ReactElement, ReactNode } from 'react';

export interface ConfirmDialogProps {
  title: string;
  description?: ReactNode;
  /** Extra content between the description and the actions (e.g. a preview). */
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  /**
   * Require a written reason before confirming — used for withdrawals, rejections and
   * other audited actions. The reason is passed to onConfirm.
   */
  requireReason?: { label: string; minLength?: number; placeholder?: string };
  /**
   * Require the acting user's own password before confirming — used for
   * security downgrades such as a 2FA reset (audit 2026-11-11, M-28). The
   * password is passed to onConfirm as the second argument and is never
   * stored; the caller sends it to the server for verification.
   */
  requirePassword?: { label?: string };
  /** May return a promise; the dialog shows a spinner and stays open until it settles. */
  onConfirm: (reason?: string, password?: string) => void | Promise<void>;
  /** Element that opens the dialog. Omit when controlling with open/onOpenChange. */
  trigger?: ReactElement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}
