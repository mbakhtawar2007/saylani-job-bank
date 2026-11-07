'use client';

import { Search } from 'lucide-react';
import { useState } from 'react';
import { Checkbox, Input } from '@/components/atoms';
import type { SelectOption } from '@/components/atoms';
import { cn } from '@/lib/utils/cn';

interface Props {
  options: SelectOption[];
  /** Currently ticked values. */
  values: string[];
  onToggle: (value: string) => void;
  disabled?: boolean;
  disabledHint?: string;
}

/**
 * Daraz/OLX-style checkbox list. Long lists (more than 7 options) get a
 * search box to narrow them, and scroll once they pass 8 rows.
 */
export function CheckboxFilterGroup({ options, values, onToggle, disabled, disabledHint }: Props) {
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const visible = query ? options.filter((o) => o.label.toLowerCase().includes(query)) : options;

  return (
    <div className="grid gap-1">
      {options.length > 7 && (
        <Input
          type="search"
          aria-label="Search filter options"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search…"
          startAdornment={<Search className="size-4" aria-hidden="true" />}
          className="mb-1 h-8 text-sm"
          disabled={disabled}
        />
      )}
      <div className={cn('grid gap-0.5', options.length > 8 && 'max-h-56 overflow-y-auto pe-1')}>
        {visible.map((option) => (
          <div key={option.value} className="hover:bg-surface-muted rounded-md px-1 py-0.5">
            <Checkbox
              label={option.label}
              checked={values.includes(option.value)}
              onCheckedChange={() => onToggle(option.value)}
              disabled={disabled}
            />
          </div>
        ))}
        {visible.length === 0 && (
          <p className="text-fg-muted px-1 py-1 text-sm">No options match “{search}”.</p>
        )}
      </div>
      {disabled && disabledHint && <p className="text-fg-muted px-1 text-xs">{disabledHint}</p>}
    </div>
  );
}
