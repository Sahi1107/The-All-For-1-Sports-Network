import type { QueryClient } from '@tanstack/react-query';

/**
 * Every cached view that a published result feeds. Publishing a match — tracked
 * live, box-scored against a fixture, or box-scored standalone — changes all of
 * them at once, and so does un-publishing or deleting one.
 *
 * This exists as one function because the failure it prevents is silent: queries
 * are cached for a minute, so a path that invalidates the fixtures list but not
 * the leaderboards leaves an organiser looking at a published result whose stat
 * leaders and rankings still say otherwise, with nothing to suggest the numbers
 * are simply stale. Call it from every publish path.
 */
export function invalidatePublishedStats(qc: QueryClient, tournamentId: string): void {
  // Per-match stat rows the tracker's leaderboards are folded from.
  qc.invalidateQueries({ queryKey: ['tournament-match-stats', tournamentId] });
  // The public Stats tab's leaderboards, served pre-ranked by the DB.
  qc.invalidateQueries({ queryKey: ['tournament-leaders', tournamentId] });
  // Fixtures/scores + the tracker session that draws them.
  qc.invalidateQueries({ queryKey: ['tracker-session', tournamentId] });
  // Ranking boards recompute server-side on publish; drop every cached slice
  // (sport / gender / tournament / category) rather than guess which is on screen.
  qc.invalidateQueries({ queryKey: ['rankings'] });
  qc.invalidateQueries({ queryKey: ['ranking-tournaments'] });
  qc.invalidateQueries({ queryKey: ['rail-rankings'] });
}
