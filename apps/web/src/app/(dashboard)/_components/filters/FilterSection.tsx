'use client';

import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { cn } from '@/lib/utils/cn';

interface Props {
  title: string;
  /** Ticked boxes in this section — shown as a count badge, like Daraz. */
  selectedCount?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}

/** One collapsible group in the filter sidebar (Status, City, …). */
export function FilterSection({ title, selectedCount = 0, defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-border border-b py-3 first:pt-0 last:border-b-0 last:pb-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="focus-visible:focus-ring flex w-full items-center gap-2 rounded-sm text-sm font-semibold"
      >
        <span className="min-w-0 truncate text-left">{title}</span>
        <span className="ms-auto flex shrink-0 items-center gap-1.5">
          {selectedCount > 0 && (
            <span className="bg-primary text-primary-fg grid size-5 place-items-center rounded-full text-xs font-semibold">
              {selectedCount}
            </span>
          )}
          <ChevronDown
            className={cn('size-4 transition-transform', open && 'rotate-180')}
            aria-hidden="true"
          />
        </span>
      </button>
      {open && <div className="mt-2 grid gap-0.5">{children}</div>}
    </section>
  );
}
