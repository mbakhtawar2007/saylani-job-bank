import { z } from 'zod';
import { masterDataCodeSchema } from '@jobbank/shared';

/**
 * Daraz/OLX-style checkbox filters are multi-select: the URL carries one
 * repeated key per ticked box (?status=OPEN&status=PAUSED). `parseListQuery`
 * already turns repeated keys into arrays, so these schemas accept either a
 * single value or an array and always normalise to an array — old
 * single-value links and bookmarks keep working unchanged.
 */
export const multiEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.enum(values), z.array(z.enum(values))])
    .transform((v) => (Array.isArray(v) ? v : [v]))
    .optional();

export const multiCode = z
  .union([masterDataCodeSchema, z.array(masterDataCodeSchema)])
  .transform((v) => (Array.isArray(v) ? v : [v]))
  .optional();

export const multiUuid = z
  .union([z.uuid(), z.array(z.uuid())])
  .transform((v) => (Array.isArray(v) ? v : [v]))
  .optional();
