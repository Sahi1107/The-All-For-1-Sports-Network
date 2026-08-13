// Lightweight relevance ranking for typeahead results. The DB match is a
// case-insensitive substring (so "kashyap" finds "Aarush Kashyap"), but for a
// typeahead the user almost always wants prefix hits first. We over-fetch a
// little, then rank in JS (cheap at ≤ a dozen rows) so exact and prefix matches
// float to the top while preserving the DB's tiebreak order (verified, name).

/** Lower score = more relevant. 0 exact · 1 name-prefix · 2 word-prefix · 3 elsewhere. */
export function relevanceScore(name: string, term: string): number {
  const n = (name ?? '').toLowerCase();
  const t = term.toLowerCase();
  if (!t) return 3;
  if (n === t) return 0;
  if (n.startsWith(t)) return 1;
  if (n.split(/\s+/).some((w) => w.startsWith(t))) return 2; // last-name / word prefix
  return 3;
}

/**
 * Stable-sort `items` by relevance to `term` (using `getName`), keeping original
 * order as the tiebreak, then cap to `limit`. Pure + side-effect free.
 */
export function rankByRelevance<T>(items: T[], term: string, getName: (x: T) => string, limit: number): T[] {
  return items
    .map((it, i) => ({ it, i, score: relevanceScore(getName(it), term) }))
    .sort((a, b) => a.score - b.score || a.i - b.i)
    .slice(0, Math.max(0, limit))
    .map((x) => x.it);
}

/** Strip SQL-LIKE wildcards from a raw query so `%`/`_` can't act as wildcards. */
export function sanitizeTerm(q: string): string {
  return q.replace(/[%_\\]/g, '').trim();
}
