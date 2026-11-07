'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

/**
 * Shared URL plumbing for the Daraz/OLX-style sidebar filters. Every filter
 * lives in the URL (so a filtered view can be shared or refreshed), one
 * repeated key per ticked box (?status=OPEN&status=PAUSED). Changing any
 * filter resets to page 1.
 */
export function useFilterParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const update = useCallback(
    (changes: Record<string, string | string[] | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(changes)) {
        next.delete(key);
        if (value === null) continue;
        if (Array.isArray(value)) {
          for (const v of value) next.append(key, v);
        } else if (value) {
          next.set(key, value);
        }
      }
      if (!('page' in changes)) next.delete('page');
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, params],
  );

  const values = useCallback((key: string) => params.getAll(key), [params]);

  const toggle = useCallback(
    (key: string, value: string, extraChanges?: Record<string, string | string[] | null>) => {
      const current = params.getAll(key);
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      update({ [key]: next.length > 0 ? next : null, ...extraChanges });
    },
    [params, update],
  );

  const setValue = useCallback(
    (key: string, value: string | null) => update({ [key]: value }),
    [update],
  );

  const clearKeys = useCallback(
    (keys: readonly string[]) => {
      const changes: Record<string, string | null> = { q: null };
      for (const key of keys) changes[key] = null;
      update(changes);
    },
    [update],
  );

  return { params, values, update, toggle, setValue, clearKeys };
}
