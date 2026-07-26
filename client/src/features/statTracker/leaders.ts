// Tournament-wide stat leaders: fold the per-match aggregators in stats.ts over
// every finished match in a session and rank players by category.
import type { TrackerSession, FootballState, BasketballState } from './types';
import { footballPlayerRows, basketballPlayerRows } from './stats';

export interface LeaderRow {
  userId: string;
  name: string;
  teamName: string;
  value: number;
}
export interface LeaderCategory {
  key: string;
  label: string;
  rows: LeaderRow[];
}

const DONE = (s: string) => s === 'COMPLETED' || s === 'PUBLISHED';

type Totals = Record<string, { name: string; teamName: string; vals: Record<string, number> }>;

function accumulate(
  totals: Totals,
  userId: string,
  name: string,
  teamName: string,
  add: Record<string, number>,
) {
  const cur = totals[userId] ?? { name, teamName, vals: {} };
  cur.name = name;
  cur.teamName = teamName;
  Object.entries(add).forEach(([k, v]) => { cur.vals[k] = (cur.vals[k] ?? 0) + v; });
  totals[userId] = cur;
}

function rank(totals: Totals, key: string, limit: number): LeaderRow[] {
  return Object.entries(totals)
    .map(([userId, t]) => ({ userId, name: t.name, teamName: t.teamName, value: t.vals[key] ?? 0 }))
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
        }),
      );
    });
    return [
      { key: 'goals', label: 'Top scorers', rows: rank(totals, 'goals', limit) },
      { key: 'assists', label: 'Assists', rows: rank(totals, 'assists', limit) },
      { key: 'ga', label: 'Goal contributions', rows: rank(totals, 'ga', limit) },
      { key: 'saves', label: 'Goalkeeper saves', rows: rank(totals, 'saves', limit) },
    ].filter((c) => c.rows.length > 0);
  }

  finished.forEach((m) => {
    if (!(m.state as BasketballState).players) return;
    basketballPlayerRows(m, session).forEach((r) =>
      accumulate(totals, r.userId, r.name, r.teamName, {
        pts: r.pts, reb: r.reb, ast: r.ast, stl: r.stl,
      }),
    );
  });
  return [
    { key: 'pts', label: 'Points', rows: rank(totals, 'pts', limit) },
    { key: 'reb', label: 'Rebounds', rows: rank(totals, 'reb', limit) },
    { key: 'ast', label: 'Assists', rows: rank(totals, 'ast', limit) },
    { key: 'stl', label: 'Steals', rows: rank(totals, 'stl', limit) },
  ].filter((c) => c.rows.length > 0);
}
