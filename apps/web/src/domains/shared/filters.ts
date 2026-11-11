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

/**
 * Audit 2026-11-11 (L-31): user search text is interpolated into ILIKE/LIKE
 * patterns. Drizzle parameterises the value (so this is not SQL injection),
 * but `%` and `_` are still wildcards — a bare `%` matches every row and
 * defeats the intended substring search. Escape them (backslash is
 * Postgres's default LIKE escape) before wrapping the value.
 */
export const escapeLikePattern = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');

/** `%escaped%` — substring search with the user's wildcards treated literally. */
export const likeContains = (value: string): string => `%${escapeLikePattern(value)}%`;

/** `escaped%` — prefix search with the user's wildcards treated literally. */
export const likeStartsWith = (value: string): string => `${escapeLikePattern(value)}%`;
