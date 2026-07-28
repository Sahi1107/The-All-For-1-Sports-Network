// In-process TTL cache for VIEWER-INDEPENDENT tournament aggregation reads:
// the /:id base (shared part only — myTeams is per-viewer and never cached),
// /teams, /fixtures, /leaders. Keyed by tournament id + view name.
//
// Correctness contract:
//  - Only viewer-independent data is stored here.
//  - Invalidated on ANY write to a tournament-visible model (config/db.ts), so a
//    published result / roster change / draw shows up immediately — not after TTL.
//  - Single-flight: concurrent misses for the same key share ONE computation, so
//    a TTL expiry under a burst doesn't stampede the DB (the failure we measured).
//  - A write during an in-flight compute (generation guard) prevents caching data
//    that predates the write, so invalidation is never lost to a race.
//
// In-process (per Cloud Run instance) by design — cheapest option, no shared store.

type Entry = { data: unknown; expires: number };

const TTL_MS = 15_000;      // 15s backstop; invalidation is the real freshness guarantee
const MAX_ENTRIES = 5_000;  // safety cap — never grow unbounded

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
let generation = 0;         // bumped on every bust; guards against caching across an invalidation

function keyFor(tournamentId: string, view: string): string {
  return `${tournamentId}::${view}`;
}

/**
 * Return the cached view, or compute it once (coalescing concurrent misses) and
 * cache the result. `compute` should return the fully-built, viewer-independent
 * payload.
 */
export async function getOrCompute<T>(
  tournamentId: string,
  view: string,
  compute: () => Promise<T>,
): Promise<T> {
  const key = keyFor(tournamentId, view);

  const hit = store.get(key);
  if (hit && Date.now() <= hit.expires) return hit.data as T;
  if (hit) store.delete(key); // expired

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const gen = generation;
  const promise = (async () => {
    try {
      const data = await compute();
      // Only cache if no invalidation happened while computing — otherwise this
      // value may predate a write, and caching it would delay a published result.
      if (generation === gen) {
        if (store.size >= MAX_ENTRIES) store.clear();
        store.set(key, { data, expires: Date.now() + TTL_MS });
      }
      return data;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise as Promise<T>;
}

/** Bust every cached view for one tournament (writes we can attribute to it). */
export function bustTournament(tournamentId: string): void {
  const prefix = `${tournamentId}::`;
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
  generation++; // invalidate any in-flight compute so it won't cache stale data
}

/** Bust everything — safe fallback for writes we can't pin to a single tournament
 *  (e.g. TrackerMatch keyed by sessionId, or updateMany/deleteMany batch counts). */
export function bustAllTournaments(): void {
  store.clear();
  generation++;
}
