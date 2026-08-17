// ─────────────────────────────────────────────────────────────────────────────
// Box score entry: the columns per sport, and the consistency checks the form
// runs as you type.
//
// The SERVER is the authority — services/manualBoxScore.ts enforces every rule
// here and rejects anything that fails. This module exists so the organiser sees
// the problem in the cell that caused it, before submitting a sheet of 20 players
// and getting one error back. Keep the two in step; the server's version wins.
//
// MINUTES ARE DELIBERATELY NOT A COLUMN. A paper scoresheet rarely records them,
// they're the most tedious figure to reconstruct after the fact, and nothing
// reads them: no ranking board weights minutes (see rankingConfig) and the
// Performance Card hides them. They stay in the schema for live-tracked matches,
// where the clock produces them for free, and default to 0 for a typed sheet.
// ─────────────────────────────────────────────────────────────────────────────

import { rulesFor } from '@af1/core';

export interface StatColumn {
  /** Field name sent to the API. */
  key: string;
  /** Column header, as printed on a box score. */
  label: string;
  /** Longer name for the input's accessible label. */
  title: string;
  max: number;
  /** Narrow columns for 1–2 digit stats keep 15+ columns on screen. */
  wide?: boolean;
}

/** Derived columns shown read-only (percentages a scoresheet prints). */
export interface DerivedColumn {
  key: string;
  label: string;
  /** Returns null when the denominator is 0 — renders as "—", never a fake 0%. */
  compute: (s: Record<string, number>) => number | null;
}

const pct = (made: number, att: number): number | null =>
  att > 0 ? Math.round((made / att) * 1000) / 10 : null;

/**
 * Basketball columns, named for what a shot is WORTH under the code being
 * entered: "3PM/3PA" on a 5v5 sheet, "2PM/2PA" on a 3x3 one. The stored fields
 * are the same either way — `threePointers` counts behind-the-arc makes in both
 * codes — but an organiser copying a 3x3 scoresheet that reads "2PT" needs the
 * column to say the same thing, or they will put the number in the wrong box.
 */
export function basketballColumns(variant?: string | null): StatColumn[] {
  const v = rulesFor(variant).values;
  const deep = `${v.behindArc}P`;
  return [
  { key: 'points',             label: 'PTS',  title: 'Points', max: 200 },
  { key: 'fieldGoalsMade',     label: 'FGM',  title: `Field goals made (including ${deep}s)`, max: 100 },
  { key: 'fieldGoalAttempts',  label: 'FGA',  title: `Field goal attempts (including ${deep}s)`, max: 150 },
  { key: 'threePointers',      label: `${deep}M`,  title: `Made from behind the arc (${v.behindArc} points)`, max: 50 },
  { key: 'threePointAttempts', label: `${deep}A`,  title: 'Attempts from behind the arc', max: 80 },
  { key: 'freeThrows',         label: 'FTM',  title: 'Free throws made', max: 60 },
  { key: 'freeThrowAttempts',  label: 'FTA',  title: 'Free throw attempts', max: 80 },
  { key: 'rebounds',           label: 'REB',  title: 'Total rebounds', max: 100 },
  { key: 'offRebounds',        label: 'OREB', title: 'Offensive rebounds (optional — the rest count as defensive)', max: 60 },
  { key: 'assists',            label: 'AST',  title: 'Assists', max: 100 },
  { key: 'steals',             label: 'STL',  title: 'Steals', max: 50 },
  { key: 'blocks',             label: 'BLK',  title: 'Blocks', max: 50 },
  { key: 'turnovers',          label: 'TOV',  title: 'Turnovers', max: 50 },
  { key: 'personalFouls',      label: 'PF',   title: 'Personal fouls', max: 10 },
  ];
}

export function basketballDerived(variant?: string | null): DerivedColumn[] {
  const deep = `${rulesFor(variant).values.behindArc}P%`;
  return [
    { key: 'fgPct', label: 'FG%', compute: (s) => pct(s.fieldGoalsMade, s.fieldGoalAttempts) },
    { key: 'tpPct', label: deep,  compute: (s) => pct(s.threePointers, s.threePointAttempts) },
    { key: 'ftPct', label: 'FT%', compute: (s) => pct(s.freeThrows, s.freeThrowAttempts) },
  ];
}

export const FOOTBALL_COLUMNS: StatColumn[] = [
  { key: 'goals',         label: 'G',   title: 'Goals', max: 50 },
  { key: 'assists',       label: 'A',   title: 'Assists', max: 50 },
  { key: 'shots',         label: 'SH',  title: 'Shots', max: 100 },
  { key: 'passes',        label: 'PAS', title: 'Passes completed', max: 300, wide: true },
  { key: 'tackles',       label: 'TKL', title: 'Tackles', max: 100 },
  { key: 'saves',         label: 'SV',  title: 'Saves', max: 100 },
  { key: 'yellowCards',   label: 'YC',  title: 'Yellow cards', max: 2 },
  { key: 'redCards',      label: 'RC',  title: 'Red cards', max: 1 },
];

export const CRICKET_COLUMNS: StatColumn[] = [
  { key: 'runs',         label: 'R',   title: 'Runs scored', max: 400 },
  { key: 'ballsFaced',   label: 'B',   title: 'Balls faced', max: 600, wide: true },
  { key: 'fours',        label: '4s',  title: 'Fours', max: 100 },
  { key: 'sixes',        label: '6s',  title: 'Sixes', max: 50 },
  { key: 'wickets',      label: 'W',   title: 'Wickets taken', max: 10 },
  { key: 'oversBowled',  label: 'OV',  title: 'Overs bowled', max: 50 },
  { key: 'runsConceded', label: 'RC',  title: 'Runs conceded', max: 400, wide: true },
  { key: 'catches',      label: 'CT',  title: 'Catches', max: 10 },
  { key: 'runOuts',      label: 'RO',  title: 'Run outs', max: 10 },
];

export function columnsFor(sport: string, variant?: string | null): StatColumn[] {
  if (sport === 'BASKETBALL') return basketballColumns(variant);
  if (sport === 'FOOTBALL') return FOOTBALL_COLUMNS;
  if (sport === 'CRICKET') return CRICKET_COLUMNS;
  return [];
}

export function derivedFor(sport: string, variant?: string | null): DerivedColumn[] {
  return sport === 'BASKETBALL' ? basketballDerived(variant) : [];
}

/** The stat a team's score is the sum of — the box score IS the result. */
export function scoreFieldFor(sport: string): string {
  if (sport === 'BASKETBALL') return 'points';
  if (sport === 'FOOTBALL') return 'goals';
  return 'runs';
}

/**
 * Per-row consistency, mirroring services/manualBoxScore. Returns the offending
 * column key plus a message, or null when the row is fine — so the form can mark
 * the exact cell rather than showing a generic "invalid" banner.
 */
export function validateRow(
  sport: string,
  s: Record<string, number>,
  variant?: string | null,
): { key: string; message: string } | null {
  const g = (k: string) => Number(s[k] ?? 0);

  if (sport === 'BASKETBALL') {
    const v = rulesFor(variant).values;
    const deep = `${v.behindArc}P`;
    const fgm = g('fieldGoalsMade'), fga = g('fieldGoalAttempts');
    const tpm = g('threePointers'), tpa = g('threePointAttempts');
    const ftm = g('freeThrows'), fta = g('freeThrowAttempts');
    if (fgm > fga) return { key: 'fieldGoalsMade', message: 'FGM cannot exceed FGA' };
    if (tpm > tpa) return { key: 'threePointers', message: `${deep}M cannot exceed ${deep}A` };
    if (ftm > fta) return { key: 'freeThrows', message: 'FTM cannot exceed FTA' };
    if (tpm > fgm) return { key: 'threePointers', message: `${deep}M cannot exceed FGM — FGM includes them` };
    if (tpa > fga) return { key: 'threePointAttempts', message: `${deep}A cannot exceed FGA — FGA includes them` };
    if (g('offRebounds') > g('rebounds')) return { key: 'offRebounds', message: 'OREB cannot exceed REB' };
    // Scored on THIS code's values — a hard-coded 2/3/1 would tell an organiser
    // their correct 21-point 3x3 line "should be 33".
    const expected = v.insideArc * (fgm - tpm) + v.behindArc * tpm + v.freeThrow * ftm;
    if (g('points') !== expected) {
      return { key: 'points', message: `PTS should be ${expected} for this shooting line` };
    }
    return null;
  }

  if (sport === 'FOOTBALL') {
    if (g('goals') > g('shots')) return { key: 'goals', message: 'Goals cannot exceed shots' };
    return null;
  }

  if (sport === 'CRICKET') {
    if (g('fours') * 4 + g('sixes') * 6 > g('runs')) {
      return { key: 'runs', message: 'Boundaries exceed the runs scored' };
    }
    return null;
  }
  return null;
}

/**
 * Points implied by a basketball shooting line. The form offers this as a
 * one-tap fix rather than making the organiser do the arithmetic.
 */
export function impliedPoints(s: Record<string, number>, variant?: string | null): number {
  const v = rulesFor(variant).values;
  const fgm = Number(s.fieldGoalsMade ?? 0);
  const tpm = Number(s.threePointers ?? 0);
  return v.insideArc * (fgm - tpm) + v.behindArc * tpm + v.freeThrow * Number(s.freeThrows ?? 0);
}
