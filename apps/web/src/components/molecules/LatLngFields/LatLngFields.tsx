'use client';

import { PAKISTAN_BOUNDS } from '@jobbank/shared';
import { useState } from 'react';
import { Input } from '@/components/atoms/Input';
import { FormField } from '../FormField';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface LatLngFieldsProps {
  /** Current point, or null when nothing is entered yet. */
  value: LatLng | null;
  onChange: (value: LatLng | null) => void;
  disabled?: boolean;
}

/**
 * Latitude / longitude typed by hand (maps removed 2026-11-12). The point
 * keeps the same GeoPoint shape as the old map pin, so matching and radius
 * logic are unchanged. Bounds are checked on submit by pakistanPointSchema;
 * these fields only need two finite numbers to produce a point.
 */
export function LatLngFields({ value, onChange, disabled }: LatLngFieldsProps) {
  const [lat, setLat] = useState(value ? String(value.lat) : '');
  const [lng, setLng] = useState(value ? String(value.lng) : '');

  const emit = (nextLat: string, nextLng: string) => {
    const parsedLat = Number.parseFloat(nextLat);
    const parsedLng = Number.parseFloat(nextLng);
    onChange(
      nextLat.trim() !== '' &&
        nextLng.trim() !== '' &&
        Number.isFinite(parsedLat) &&
        Number.isFinite(parsedLng)
        ? { lat: parsedLat, lng: parsedLng }
        : null,
    );
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField
        label="Latitude"
        required
        hint={`${PAKISTAN_BOUNDS.minLat} – ${PAKISTAN_BOUNDS.maxLat} (Pakistan)`}
      >
        <Input
          type="number"
          step="any"
          inputMode="decimal"
          placeholder="e.g. 24.8607"
          value={lat}
          disabled={disabled}
          onChange={(e) => {
            setLat(e.target.value);
            emit(e.target.value, lng);
          }}
        />
      </FormField>
      <FormField
        label="Longitude"
        required
        hint={`${PAKISTAN_BOUNDS.minLng} – ${PAKISTAN_BOUNDS.maxLng} (Pakistan)`}
      >
        <Input
          type="number"
          step="any"
          inputMode="decimal"
          placeholder="e.g. 67.0011"
          value={lng}
          disabled={disabled}
          onChange={(e) => {
            setLng(e.target.value);
            emit(lat, e.target.value);
          }}
        />
      </FormField>
    </div>
  );
}
