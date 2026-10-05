/**
 * A tiny in-process cache for the public completed-interview count.
 *
 * The public endpoint is called by every visitor of a website, with no
 * authentication, so each request must not turn into a database query. The CDN
 * cache in front of it helps, but a caller can bypass that by varying the query
 * string; this keeps the database cost bounded regardless. It is per server
 * instance, not shared, which is fine: at worst each warm instance asks the
 * database once per TTL.
 *
 * Concurrent requests for the same study share one lookup, and a lookup that
 * fails or finds nothing is not remembered, so the next request tries again.
 */
export function createCompletedCountCache(options: { ttlMs?: number; now?: () => number } = {}) {
  const ttlMs = options.ttlMs ?? 60_000;
  const now = options.now ?? Date.now;
  const values = new Map<string, { count: number; expiresAt: number }>();
  const inFlight = new Map<string, Promise<number | null>>();

  return {
    /** The cached count for `studyId`, or the result of `load()` (remembered for the TTL if it found a count). `null` means the study doesn't exist. */
    async get(studyId: string, load: () => Promise<number | null>): Promise<number | null> {
      const cached = values.get(studyId);
      if (cached && cached.expiresAt > now()) return cached.count;

      const pending = inFlight.get(studyId);
      if (pending) return pending;

      const lookup = (async () => {
        try {
          const count = await load();
          if (count !== null) values.set(studyId, { count, expiresAt: now() + ttlMs });
          return count;
        } finally {
          inFlight.delete(studyId);
        }
      })();
      inFlight.set(studyId, lookup);
      return lookup;
    },
  };
}
