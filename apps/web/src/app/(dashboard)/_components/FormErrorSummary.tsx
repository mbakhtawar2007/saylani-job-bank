'use client';

import type { FieldIssue } from '@jobbank/shared';
import { useCallback, useEffect, useRef } from 'react';
import { ErrorBanner } from '@/components/molecules';
import type { FieldErrors } from './applicants/form';

/**
 * Shared error visibility for the staff registration dialogs (F3).
 *
 * The validation rules and per-field error text already exist; the gap was
 * visibility: a failed submit set the errors and returned, leaving the user
 * on section 6 with a submit button that looked dead. This module gives both
 * dialogs the same three behaviours:
 *
 * 1. A stable DOM id per field, derived from its error key
 *    (`fieldControlId`), passed as the FormField `id` so the rendered
 *    control carries it (atoms take their id from FieldContext).
 * 2. `focusField` — scrolls the field into view and focuses its control
 *    (radio groups focus their first option, whose id is `${id}-${value}`).
 * 3. `FormErrorSummary` — a list of every error, rendered next to the submit
 *    button; each item jumps to its field when clicked.
 */

export function fieldControlId(key: string): string {
  return `field-${key.replace(/[^a-zA-Z0-9]+/g, '-')}`;
}

function preferredScrollBehavior(): ScrollBehavior {
  if (typeof window === 'undefined') return 'auto';
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

function firstFocusable(el: Element): HTMLElement | null {
  return el.querySelector(
    'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ) as HTMLElement | null;
}

function focusElement(el: HTMLElement): void {
  const tag = el.tagName;
  const target =
    tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON'
      ? el
      : firstFocusable(el);
  if (target) target.focus({ preventScroll: true });
}

/** Scroll the field for `key` into view and focus its control. Returns false if no element matches. */
export function focusField(key: string): boolean {
  if (typeof document === 'undefined') return false;
  const id = fieldControlId(key);
  const behavior = preferredScrollBehavior();
  const direct = document.getElementById(id);
  if (direct) {
    direct.scrollIntoView({ behavior, block: 'center' });
    if (direct instanceof HTMLElement) focusElement(direct);
    return true;
  }
  // Radio groups render one control per option, id'd `${id}-${value}`.
  const option = document.querySelector(`[id^="${id}-"]`);
  if (option) {
    option.scrollIntoView({ behavior, block: 'center' });
    if (option instanceof HTMLElement) focusElement(option);
    return true;
  }
  // Standalone error paragraphs (e.g. the map location) carry `${id}-error`.
  const errorEl = document.getElementById(`${id}-error`);
  if (errorEl) {
    errorEl.scrollIntoView({ behavior, block: 'center' });
    return true;
  }
  return false;
}

/** Focus the first error in `errors` (insertion order). Returns the focused key, or null. */
export function focusFirstFieldError(errors: FieldErrors): string | null {
  for (const key of Object.keys(errors)) {
    if (focusField(key)) return key;
  }
  return null;
}

export function humanizeFieldKey(key: string): string {
  if (key === '(root)') return 'Form';
  const leaf = key.split('.').pop() ?? key;
  return leaf.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

interface FormErrorSummaryProps {
  errors: FieldErrors;
  /** Visible label for an error key (falls back to a humanized key). */
  labelFor: (key: string) => string;
}

/**
 * Lists every current field error next to the submit button. Each item is a
 * button that jumps to its field. Renders nothing when there are no errors.
 */
export function FormErrorSummary({ errors, labelFor }: FormErrorSummaryProps) {
  const entries = Object.entries(errors);
  if (entries.length === 0) return null;
  return (
    <div role="alert" className="bg-danger-soft text-danger-soft-fg rounded-lg px-4 py-3 text-sm">
      <p className="font-semibold">
        {entries.length === 1
          ? 'Please fix this field before saving:'
          : `Please fix these ${entries.length} fields before saving:`}
      </p>
      <ul className="mt-2 grid gap-1">
        {entries.map(([key, message]) => (
          <li key={key}>
            <button
              type="button"
              className="cursor-pointer text-left underline underline-offset-2 hover:opacity-80"
              onClick={() => focusField(key)}
            >
              {labelFor(key)} — {message}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The same summary for API (422) errors: renders the shared ErrorBanner
 * validation list next to the submit button, so a server rejection is as
 * visible as a client-side one. Each item jumps to its field (via
 * `focusField`) unless the caller passes its own `onIssueClick`. Renders
 * nothing when there are no issues. Use this in the long wizards
 * (CompanyWizard, JobWizard, EmployerSignupForm) alongside
 * `FormErrorSummary` for client-side errors.
 */
export function ApiErrorSummary({
  issues,
  onIssueClick,
}: {
  issues: readonly FieldIssue[];
  onIssueClick?: (path: string) => void;
}) {
  if (issues.length === 0) return null;
  return (
    <ErrorBanner variant="validation" issues={issues} onIssueClick={onIssueClick ?? focusField} />
  );
}

type FormRef = { current: HTMLFormElement | null };

/**
 * After a failed submit, move the user to the first invalid field (or, for a
 * non-field API error, to the alert at the top of the form). Call
 * `requestErrorFocus` / `requestAlertFocus` in the same tick as `setErrors` /
 * `setAlert`; the effect runs once the new errors have rendered, so the
 * target always exists by then. Field errors set any other way (e.g. the
 * full-name blur check) never trigger a jump.
 */
export function useFocusFieldErrors(errors: FieldErrors, formRef: FormRef, alert: unknown) {
  const pendingRef = useRef<'errors' | 'alert' | null>(null);

  useEffect(() => {
    if (pendingRef.current === 'errors') {
      pendingRef.current = null;
      if (Object.keys(errors).length > 0) {
        const focused = focusFirstFieldError(errors);
        if (!focused) formRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' });
      }
    } else if (pendingRef.current === 'alert') {
      pendingRef.current = null;
      formRef.current
        ?.querySelector(':scope > [role="alert"]')
        ?.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'start' });
    }
  }, [errors, alert, formRef]);

  const requestErrorFocus = useCallback(() => {
    pendingRef.current = 'errors';
  }, []);
  const requestAlertFocus = useCallback(() => {
    pendingRef.current = 'alert';
  }, []);
  return { requestErrorFocus, requestAlertFocus };
}
