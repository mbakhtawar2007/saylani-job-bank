/**
 * Tiny bounded TTL cache for geocode lookups.
 *
 * The previous caches were unbounded per-process Maps keyed partly on the city-list
 * length, so they grew forever and two different city lists of equal length
 * collided and returned each other's cityCode/cityLabel. This cache evicts the
 * least-recently-used entry past `maxEntries`, expires entries after `ttlMs`, and
 * callers key on the actual city codes+labels, not the list length.
 */
export interface BoundedCache<V> {
  get(key: string): V | undefined;
  set(key: string, value: V): void;
}

export function createBoundedCache<V>(maxEntries: number, ttlMs: number): BoundedCache<V> {
  const entries = new Map<string, { value: V; expiresAt: number }>();
  return {
    get(key: string): V | undefined {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= Date.now()) {
        entries.delete(key);
        return undefined;
      }
      // Refresh recency (not the TTL) on hit.
      entries.delete(key);
      entries.set(key, entry);
      return entry.value;
    },
    set(key: string, value: V): void {
      if (entries.has(key)) entries.delete(key);
      entries.set(key, { value, expiresAt: Date.now() + ttlMs });
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next();
        if (oldest.done) break;
        entries.delete(oldest.value);
      }
    },
  };
}
