'use client';

import { X } from 'lucide-react';

export interface ActiveFilterChip {
  key: string;
  value: string;
  label: string;
}

interface Props {
  chips: ActiveFilterChip[];
  onRemove: (chip: ActiveFilterChip) => void;
  onClearAll: () => void;
}

/** Removable pills for every active filter, like Daraz/OLX above the results. */
export function ActiveFilterChips({ chips, onRemove, onClearAll }: Props) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
      {chips.map((chip) => (
        <span
          key={`${chip.key}:${chip.value}`}
          className="border-border bg-surface inline-flex items-center gap-1 rounded-full border py-1 ps-2.5 pe-1 text-xs font-medium"
        >
          {chip.label}
          <button
            type="button"
            aria-label={`Remove filter ${chip.label}`}
            onClick={() => onRemove(chip)}
            className="focus-visible:focus-ring hover:bg-surface-muted grid size-4 place-items-center rounded-full"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="focus-visible:focus-ring text-primary rounded-sm px-1 py-1 text-xs font-semibold hover:underline"
      >
        Clear all
      </button>
    </div>
  );
}
