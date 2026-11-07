'use client';

import { SlidersHorizontal, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/atoms';

interface Props {
  /** Ticked boxes across all sections. */
  activeCount: number;
  /** Mobile drawer state — the sidebar is always visible on desktop. */
  open: boolean;
  onClose: () => void;
  onClearAll: () => void;
  children: ReactNode;
}

/**
 * Daraz/OLX-style filter sidebar: a sticky card on the left on desktop, and
 * a slide-in drawer on mobile. Filters apply instantly as boxes are ticked,
 * so the drawer only needs Done — there is no staged Apply step.
 */
export function FilterSidebar({ activeCount, open, onClose, onClearAll, children }: Props) {
  const header = (
    <div className="flex items-center gap-2">
      <SlidersHorizontal className="size-4" aria-hidden="true" />
      <h2 className="text-sm font-semibold">Filters</h2>
      {activeCount > 0 && (
        <span className="bg-primary text-primary-fg grid size-5 place-items-center rounded-full text-xs font-semibold">
          {activeCount}
        </span>
      )}
      <button
        type="button"
        onClick={onClearAll}
        disabled={activeCount === 0}
        className="focus-visible:focus-ring text-primary ms-auto rounded-sm text-xs font-semibold hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50"
      >
        Clear all
      </button>
    </div>
  );

  return (
    <>
      <aside className="hidden min-w-0 lg:block">
        <div className="border-border bg-surface sticky top-4 grid gap-1 rounded-xl border p-4">
          {header}
          <div>{children}</div>
        </div>
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Filters"
        >
          <button
            type="button"
            aria-label="Close filters"
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-black/50"
          />
          <div className="bg-surface absolute inset-y-0 left-0 flex w-[85%] max-w-xs flex-col p-4 shadow-xl">
            <div className="flex items-center gap-2">
              <div className="grid flex-1 gap-1">{header}</div>
              <button
                type="button"
                aria-label="Close filters"
                onClick={onClose}
                className="focus-visible:focus-ring hover:bg-surface-muted grid size-8 shrink-0 place-items-center rounded-md"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-1 flex-1 overflow-y-auto">{children}</div>
            <Button onClick={onClose} className="mt-3 w-full">
              Done{activeCount > 0 ? ` (${activeCount} selected)` : ''}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
