import { normalizePosition } from './positions';

// ─────────────────────────────────────────────────────────────────────────────
// RANKING CONFIG — the single, tunable source of truth for how tournament
// rankings are scored. Weights live here as DATA, not scattered through scoring
// logic, so tuning (e.g. when the coach returns with adjusted basketball weights)
// is a one-file edit, not a code change. Could later move to a DB-backed admin
// surface without touching the scoring service — the service reads this shape.
//
// Two kinds of board per sport:
//   • OVERALL   — one positionless formula; the best player is visible wherever
//                 they play (the modern game is positionless).
//   • POSITION  — separate boards, each scoring within a position group on the
//                 criteria that suit it.
//
// A board's score for a player-match = Σ factor.weight × transform(stat[field]),
// floored at 0 per game (so a foul- or turnover-heavy night contributes 0, never
// a runaway negative — see FOUL_OUT_LIMIT + the per-game floor in rankingService).
// Then averaged over the player's games and normalized to 0–100 by the board's
// REF (the raw per-game score that reads as ~90 — an elite game). REF is
// per-board so a point guard's 85 and a centre's 85 mean comparably strong games.
// ─────────────────────────────────────────────────────────────────────────────

/** A player fouls out at 5 personal fouls (FIBA 5v5) — mirrors the 5v5 rules in
 *  basketball/variant.ts. Used only to FLAG a foul-out (a visible signal on
 *  profile + leaderboard); it does NOT add extra score penalty (fouls are
 *  already a small negative weight, naturally capped at this limit since the
 *  player is then ejected).
 *
 *  3x3 has NO personal-foul disqualification, so the flag never applies there —
 *  see rankingService, which only sets it for the 5v5 board. */
export const FOUL_OUT_LIMIT = 5;

/** Optional transform applied to a raw stat before weighting. */
export type StatTransform = 'linear' | 'positiveOnly' | 'economyBonus';

export interface Factor {
  field: string;              // a persisted stat column (BasketballStats/FootballStats/CricketStats)
  weight: number;
  transform?: StatTransform;  // default 'linear'
}

export interface Board {
  key: string;                // 'OVERALL' | position-group key
  label: string;
  factors: Factor[];
  /** Raw per-game score that normalizes to ~90 (an elite game for THIS board). */
  ref: number;
}

export interface SportRanking {
  overall: Board;
  positions: Board[];
  /** Map a free-text player position to one position-board key (or null → the
   *  player appears only on the overall board until a position is assigned). */
  groupOf: (position: string | null | undefined) => string | null;
}

/** transform a raw stat value. */
export function applyTransform(v: number, t: StatTransform = 'linear'): number {
  if (t === 'positiveOnly') return v > 0 ? v : 0;
  if (t === 'economyBonus') return v > 0 ? 12 - v : 0; // lower economy = better; can go negative (floored per-game)
  return v;
}

/** Normalize a raw per-game score to 0–100 for a board (raw/REF × 90, capped). */
export function normalizeScore(raw: number, ref: number): number {
  if (ref <= 0) return 0;
  return Math.min(100, Math.round((Math.max(0, raw) / ref) * 90 * 10) / 10);
}

// ─── Position-group matchers (free text → board key) ─────────────────────────
// Ordered: more specific patterns first (e.g. "shooting guard" before "guard").
// Three boards — PG and SG are guards, SF and PF are forwards, C is a center.
// Delegated to the canonical taxonomy in data/positions.ts, which already
// collapses exactly this way and owns every alias ("pg", "power forward",
// "centre"). Two copies of that vocabulary would drift, and a position that
// resolved for search but not for rankings would silently drop a player off a
// board. `floor general` / `big` aren't in the taxonomy, so they're kept here.
const bball = (pos?: string | null): string | null => {
  const canonical = normalizePosition('BASKETBALL', pos);
  if (canonical) return canonical.toUpperCase(); // Guard → GUARD, etc.
  const p = (pos ?? '').toLowerCase();
  if (!p) return null;
  if (/floor general/.test(p)) return 'GUARD';
  if (/\bwing\b/.test(p)) return 'FORWARD';
  if (/\bbig\b/.test(p)) return 'CENTER';
  return null;
};
const football = (pos?: string | null): string | null => {
  const p = (pos ?? '').toLowerCase();
  if (!p) return null;
  if (/keeper|goalie|\bgk\b/.test(p)) return 'GK';
  if (/def|\bcb\b|\blb\b|\brb\b|\bwb\b|full.?back|centre.?back|center.?back/.test(p)) return 'DEF';
  if (/mid|\bcm\b|\bdm\b|\bam\b|\blm\b|\brm\b/.test(p)) return 'MID';
  if (/forward|strik|wing|\bst\b|\bcf\b|\blw\b|\brw\b/.test(p)) return 'FWD';
  return null;
};
const cricket = (pos?: string | null): string | null => {
  const p = (pos ?? '').toLowerCase();
  if (!p) return null;
  if (/all.?round/.test(p)) return 'ALL';
  if (/bowl/.test(p)) return 'BOWL';
  if (/keeper|\bwk\b|bat/.test(p)) return 'BAT'; // wicketkeepers rank on the batting board
  return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// THE CONFIG. Weights + REFs below are the tunable defaults. Basketball weights
// are the proposal sent to the coach; the football/cricket boards are reasonable
// defaults to be tuned later. Every weight "means what it says" (no double
// counting): the wing board scores shot types directly (2pt/3pt/FT), not points.
// ─────────────────────────────────────────────────────────────────────────────
export const RANKING_CONFIG: Record<string, SportRanking> = {
  BASKETBALL: {
    overall: {
      key: 'OVERALL', label: 'Overall', ref: 22,
      factors: [
        { field: 'points', weight: 0.45 },
        { field: 'assists', weight: 0.40 },
        { field: 'offRebounds', weight: 0.45 },
        { field: 'defRebounds', weight: 0.30 },
        { field: 'steals', weight: 0.30 },
        { field: 'blocks', weight: 0.30 },
        { field: 'freeThrows', weight: 0.10 },
        { field: 'turnovers', weight: -0.20 },
        { field: 'personalFouls', weight: -0.10 },
      ],
    },
    positions: [
      // GUARD covers PG and SG, so it can't lean as hard on assists as a
      // point-guard-only board did — scoring is weighted alongside creation, or
      // every shooting guard would rank below every point guard by construction.
      { key: 'GUARD', label: 'Guards', ref: 12, factors: [
        { field: 'points', weight: 0.40 },
        { field: 'assists', weight: 0.35 },
        { field: 'steals', weight: 0.30 },
        { field: 'freeThrows', weight: 0.10 },
        { field: 'turnovers', weight: -0.20 },
        { field: 'personalFouls', weight: -0.10 },
      ] },
      // FORWARD covers SF and PF — scoring and rebounding both count, since the
      // board spans a perimeter forward and a back-to-the-basket one.
      { key: 'FORWARD', label: 'Forwards', ref: 13, factors: [
        { field: 'points', weight: 0.40 },
        { field: 'offRebounds', weight: 0.40 },
        { field: 'defRebounds', weight: 0.28 },
        { field: 'blocks', weight: 0.25 },
        { field: 'steals', weight: 0.20 },
        { field: 'freeThrows', weight: 0.10 },
        { field: 'turnovers', weight: -0.18 },
        { field: 'personalFouls', weight: -0.10 },
      ] },
      { key: 'CENTER', label: 'Centers', ref: 12, factors: [
        { field: 'offRebounds', weight: 0.45 },
        { field: 'defRebounds', weight: 0.30 },
        { field: 'points', weight: 0.30 },
        { field: 'blocks', weight: 0.35 },
        { field: 'freeThrows', weight: 0.10 },
        { field: 'personalFouls', weight: -0.12 },
      ] },
    ],
    groupOf: bball,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // BASKETBALL 3x3 — a SEPARATE board, not the 5v5 one with different numbers.
  //
  // Four things make 5v5 weights wrong here, and each pushed a weight below:
  //
  //  1. THE SCALE. A basket is worth 1 or 2, not 2 or 3, and a game ends at 21.
  //     A strong 3x3 game is 6–9 points, where a strong 5v5 game is ~20. Scoring
  //     the two on one REF would put every 3x3 player near the bottom of a
  //     shared board, so `points` is weighted up AND the REF is dropped to ~9.
  //
  //  2. POSSESSION IS THE GAME. There are no quarters to trade and no long
  //     stretches to recover in — a 10-minute game to 21 turns on roughly 30
  //     possessions. An offensive rebound is a whole extra possession in a game
  //     that has few, so it carries the heaviest non-scoring weight; a turnover
  //     hands one straight back and is penalised harder than in 5v5.
  //
  //  3. FEWER PASSES PER POSSESSION. Three players and a 12-second shot clock
  //     mean far fewer assists per game, and much of the creation is a screen or
  //     a drive that never shows up as one. Weighting assists at the 5v5 level
  //     would leave the board measuring a stat that barely occurs; it stays a
  //     real positive but no longer rivals scoring.
  //
  //  4. FOULS ARE CHEAPER. Nobody fouls out in 3x3, so a foul costs possession
  //     and free throws but never a player's night. The penalty stays small.
  //
  // POSITIONLESS BY DESIGN — no position boards. Three players cover the whole
  // floor; a "3x3 centre" is not a thing you can rank against other centres, and
  // grouping on the profile's 5v5 position would sort players by a role they are
  // not playing in this competition.
  //
  // These are DEFAULTS, tunable like the 5v5 weights above — the same one-file
  // edit when the coach comes back with adjustments.
  // ───────────────────────────────────────────────────────────────────────────
  BASKETBALL_3X3: {
    overall: {
      key: 'OVERALL', label: 'Overall', ref: 9,
      factors: [
        { field: 'points', weight: 0.55 },
        { field: 'offRebounds', weight: 0.55 },
        { field: 'defRebounds', weight: 0.35 },
        { field: 'steals', weight: 0.35 },
        { field: 'blocks', weight: 0.30 },
        { field: 'assists', weight: 0.25 },
        { field: 'freeThrows', weight: 0.10 },
        { field: 'turnovers', weight: -0.30 },
        { field: 'personalFouls', weight: -0.08 },
      ],
    },
    positions: [],
    groupOf: () => null,
  },

  FOOTBALL: {
    overall: {
      key: 'OVERALL', label: 'Overall', ref: 1.8,
      factors: [
        { field: 'goals', weight: 0.30 },
        { field: 'assists', weight: 0.20 },
        { field: 'saves', weight: 0.20 },
        { field: 'tackles', weight: 0.15 },
        { field: 'shots', weight: 0.03 },
        { field: 'passes', weight: 0.00075 },
        { field: 'yellowCards', weight: -0.10 },
        { field: 'redCards', weight: -0.30 },
      ],
    },
    positions: [
      { key: 'FWD', label: 'Forwards', ref: 1.4, factors: [
        { field: 'goals', weight: 0.45 },
        { field: 'assists', weight: 0.20 },
        { field: 'shots', weight: 0.05 },
        { field: 'passes', weight: 0.00075 },
        { field: 'yellowCards', weight: -0.10 },
        { field: 'redCards', weight: -0.30 },
      ] },
      { key: 'MID', label: 'Midfielders', ref: 1.7, factors: [
        { field: 'assists', weight: 0.30 },
        { field: 'goals', weight: 0.20 },
        { field: 'tackles', weight: 0.20 },
        { field: 'passes', weight: 0.002 },
        { field: 'shots', weight: 0.03 },
        { field: 'yellowCards', weight: -0.10 },
        { field: 'redCards', weight: -0.30 },
      ] },
      { key: 'DEF', label: 'Defenders', ref: 2.3, factors: [
        { field: 'tackles', weight: 0.35 },
        { field: 'goals', weight: 0.15 },
        { field: 'assists', weight: 0.10 },
        { field: 'passes', weight: 0.001 },
        { field: 'yellowCards', weight: -0.12 },
        { field: 'redCards', weight: -0.35 },
      ] },
      { key: 'GK', label: 'Goalkeepers', ref: 3.6, factors: [
        { field: 'saves', weight: 0.45 },
        { field: 'passes', weight: 0.001 },
        { field: 'yellowCards', weight: -0.10 },
        { field: 'redCards', weight: -0.35 },
      ] },
    ],
    groupOf: football,
  },

  CRICKET: {
    overall: {
      key: 'OVERALL', label: 'Overall', ref: 26,
      factors: [
        { field: 'wickets', weight: 1.25 },
        { field: 'runs', weight: 0.25 },
        { field: 'catches', weight: 0.20 },
        { field: 'runOuts', weight: 0.15 },
        { field: 'economy', weight: 0.15, transform: 'economyBonus' },
        { field: 'strikeRate', weight: 0.0015, transform: 'positiveOnly' },
        { field: 'sixes', weight: 0.05 },
        { field: 'fours', weight: 0.025 },
      ],
    },
    positions: [
      { key: 'BAT', label: 'Batting', ref: 31, factors: [
        { field: 'runs', weight: 0.30 },
        { field: 'strikeRate', weight: 0.002, transform: 'positiveOnly' },
        { field: 'sixes', weight: 0.08 },
        { field: 'fours', weight: 0.04 },
        { field: 'catches', weight: 0.10 },
        { field: 'runOuts', weight: 0.08 },
      ] },
      { key: 'BOWL', label: 'Bowling', ref: 9, factors: [
        { field: 'wickets', weight: 1.5 },
        { field: 'economy', weight: 0.20, transform: 'economyBonus' },
        { field: 'catches', weight: 0.10 },
        { field: 'runOuts', weight: 0.08 },
      ] },
      { key: 'ALL', label: 'All-rounders', ref: 12, factors: [
        { field: 'runs', weight: 0.20 },
        { field: 'wickets', weight: 1.0 },
        { field: 'catches', weight: 0.15 },
        { field: 'runOuts', weight: 0.10 },
        { field: 'strikeRate', weight: 0.0015, transform: 'positiveOnly' },
        { field: 'economy', weight: 0.12, transform: 'economyBonus' },
        { field: 'sixes', weight: 0.05 },
      ] },
    ],
    groupOf: cricket,
  },
};
