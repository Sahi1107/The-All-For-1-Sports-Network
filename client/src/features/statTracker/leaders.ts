// Tournament-wide stat leaders: fold the per-match aggregators in stats.ts over
// every finished match in a session and rank players by category.
import type { TrackerSession, FootballState, BasketballState } from './types';
// Explicit extension: the repo's test runner is `node --experimental-strip-types`,
// which resolves as native ESM and won't infer one. tsconfig already enables
// allowImportingTsExtensions for exactly this, and Vite resolves it unchanged.
import { footballPlayerRows, basketballPlayerRows } from './stats.ts';

export interface LeaderRow {
  userId: string;
  name: string;
  teamName: string;
  /** Per-game average when the category is `perGame`, else the raw total. */
  value: number;
  /** Games the player actually appeared in — the divisor behind `value`. */
  games: number;
}
export interface LeaderCategory {
  key: string;
  label: string;
  rows: LeaderRow[];
  /** True when `value` is an average. Drives the "per game" wording. */
  perGame?: boolean;
  /** Games a player needed to qualify for this averaged board (see QUALIFY_SHARE). */
  minGames?: number;
}

/**
 * Share of their OWN TEAM's games a player must appear in to make an averaged
 * leaderboard. Team-relative on purpose: in a knockout, a team eliminated in
 * round one played a single game, and a tournament-wide minimum would erase
 * every player on every early-exit team rather than just the small samples it's
 * meant to catch. At 50%, a squad player who appeared in 1 of 4 is excluded
 * while everyone from a one-and-done team still qualifies.
 */
export const QUALIFY_SHARE = 0.5;

/** Games needed to qualify, given how many games the player's team played. */
export function minGamesToQualify(teamGames: number): number {
  return Math.max(1, Math.ceil(teamGames * QUALIFY_SHARE));
}

const DONE = (s: string) => s === 'COMPLETED' || s === 'PUBLISHED';

type Totals = Record<string, { name: string; teamName: string; teamId: string; games: number; vals: Record<string, number> }>;

function accumulate(
  totals: Totals,
  userId: string,
  name: string,
  teamName: string,
  add: Record<string, number>,
  played: boolean,
  teamId = '',
) {
  const cur = totals[userId] ?? { name, teamName, teamId, games: 0, vals: {} };
  cur.name = name;
  cur.teamName = teamName;
  if (teamId) cur.teamId = teamId;
  // Only count a game the player was actually in. basketballPlayerRows emits a
  // row for EVERY rostered player (they're zero-initialised at tip-off), so
  // counting rows would divide by squad size and understate every average.
  if (played) cur.games += 1;
  Object.entries(add).forEach(([k, v]) => { cur.vals[k] = (cur.vals[k] ?? 0) + v; });
  totals[userId] = cur;
}

function rank(
  totals: Totals, key: string, limit: number, perGame: boolean,
  teamGames: Map<string, number> = new Map(),
): LeaderRow[] {
  return Object.entries(totals)
    // On an averaged board, drop anyone short of the qualifying appearances —
    // a single cameo would otherwise outrank a season of consistent work.
    .filter(([, t]) => !perGame || t.games >= minGamesToQualify(teamGames.get(t.teamId) ?? t.games))
    .map(([userId, t]) => {
      const total = t.vals[key] ?? 0;
      const value = perGame && t.games > 0 ? Math.round((total / t.games) * 10) / 10 : total;
      return { userId, name: t.name, teamName: t.teamName, value, games: t.games };
    })
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Ranked leader categories for the whole tournament (top `limit` each). */
export function tournamentLeaders(session: TrackerSession, limit = 5): LeaderCategory[] {
  const finished = session.matches.filter(
    (m) => DONE(m.status) && m.state && m.homeTeamId && m.awayTeamId,
  );
  const totals: Totals = {};

  if (session.sport === 'FOOTBALL') {
    finished.forEach((m) => {
      if (!(m.state as FootballState).events) return;
      footballPlayerRows(m, session).forEach((r) =>
        accumulate(totals, r.userId, r.name, r.teamName, {
          goals: r.goals,
          assists: r.assists,
          ga: r.goals + r.assists,
          saves: r.saves,
        }, r.minutes > 0 || r.goals + r.assists + r.saves + r.tackles + r.shots > 0, ''),
      );
    });
    return [
      { key: 'goals', label: 'Top scorers', rows: rank(totals, 'goals', limit, false) },
      { key: 'assists', label: 'Assists', rows: rank(totals, 'assists', limit, false) },
      { key: 'ga', label: 'Goal contributions', rows: rank(totals, 'ga', limit, false) },
      { key: 'saves', label: 'Goalkeeper saves', rows: rank(totals, 'saves', limit, false) },
    ].filter((c) => c.rows.length > 0);
  }

  // Games each TEAM played — the denominator behind the qualifying threshold.
  const teamGames = new Map<string, number>();
  finished.forEach((m) => {
    [m.homeTeamId, m.awayTeamId].forEach((id) => {
      if (id) teamGames.set(id, (teamGames.get(id) ?? 0) + 1);
    });
  });

  finished.forEach((m) => {
    if (!(m.state as BasketballState).players) return;
    basketballPlayerRows(m, session).forEach((r) =>
      accumulate(totals, r.userId, r.name, r.teamName, {
        pts: r.pts, reb: r.reb, ast: r.ast, stl: r.stl,
      }, r.min > 0 || r.pts + r.reb + r.ast + r.stl + r.blk + r.to + r.fga + r.tpa + r.fta > 0, r.teamId),
    );
  });
  // Once the tournament runs to more than one game, totals reward whoever
  // played most rather than who played best, so basketball leaders switch to
  // per-game. A single-game tournament keeps raw totals (they're identical
  // anyway, and "per game" would be noise).
  const perGame = Object.values(totals).some((t) => t.games > 1);
  const per = (label: string) => (perGame ? `${label} per game` : label);
  // Caption value. Teams can have played different numbers of games, so the
  // threshold varies per player; report the most common bar rather than implying
  // a single global one.
  const minGames = perGame
    ? Math.max(1, ...[...teamGames.values()].map(minGamesToQualify))
    : undefined;
  const cat = (key: string, label: string) => ({
    key, label: per(label), rows: rank(totals, key, limit, perGame, teamGames), perGame, minGames,
  });
  return [
    cat('pts', 'Points'), cat('reb', 'Rebounds'), cat('ast', 'Assists'), cat('stl', 'Steals'),
  ].filter((c) => c.rows.length > 0);
}
