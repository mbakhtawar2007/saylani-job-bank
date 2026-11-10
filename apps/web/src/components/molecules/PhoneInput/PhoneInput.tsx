'use client';

import { useState } from 'react';
import { Input } from '@/components/atoms/Input';
import {
  formatPkMobileNational,
  isSupportedPkMobile,
  PAKISTAN_MOBILE_PREFIXES,
  normalizePkMobile,
  toNationalMobileDigits,
} from '@/lib/format/phone';
import type { PhoneInputProps } from './phoneInput.types';

/** Pakistani mobile number input with a fixed +92 prefix ("300 1234567"). */
export function PhoneInput({
  value,
  onChange,
  placeholder = '300 1234567',
  segmented = false,
  ...props
}: PhoneInputProps) {
  const [internal, setInternal] = useState(() => toNationalMobileDigits(value ?? ''));
  const national = value !== undefined ? toNationalMobileDigits(value) : internal;
  const selectedPrefix = national.slice(0, 3);
  const subscriber = national.slice(3);
  const updateParts = (prefix: string, rest: string) => {
    const next = `${prefix}${rest.replace(/\D/g, '').slice(0, 7)}`;
    setInternal(next);
    const normalized = normalizePkMobile(next);
    const e164 = normalized && isSupportedPkMobile(normalized) ? normalized : null;
    onChange?.({ e164, national: next, valid: e164 !== null && isSupportedPkMobile(e164) });
  };

  if (segmented) {
    return (
      <div className="grid w-full grid-cols-[auto_minmax(7rem,0.9fr)_minmax(8rem,1.4fr)] gap-2 sm:flex">
        <div className="border-border-strong bg-surface-muted text-fg-muted flex h-10 items-center rounded-lg border px-3 text-sm font-medium">
          +92
        </div>
        <select
          aria-label="Original network allocation"
          className="border-primary/25 bg-primary-soft text-primary-soft-fg h-10 min-w-0 rounded-lg border px-2 text-sm"
          value={selectedPrefix}
          onChange={(event) => updateParts(event.target.value, subscriber)}
        >
          <option value="">Prefix</option>
          {PAKISTAN_MOBILE_PREFIXES.map(({ prefix, network }) => (
            <option key={prefix} value={prefix}>
              {network} — {prefix}
            </option>
          ))}
        </select>
        <Input
          {...props}
          aria-label="Seven-digit subscriber number"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="1234567"
          value={subscriber}
          onChange={(event) => updateParts(selectedPrefix, event.target.value)}
          className="numeric"
        />
      </div>
    );
  }

  return (
    <Input
      type="tel"
      inputMode="numeric"
      autoComplete="tel-national"
      placeholder={placeholder}
      value={formatPkMobileNational(national)}
      onChange={(event) => {
        const next = toNationalMobileDigits(event.target.value);
        setInternal(next);
        const e164 = normalizePkMobile(next);
        onChange?.({ e164, national: next, valid: e164 !== null });
      }}
      startAdornment={
        <span className="border-border text-fg-muted numeric border-e pe-2 text-sm font-medium">
          +92
        </span>
      }
      className="numeric"
      {...props}
    />
  );
}
