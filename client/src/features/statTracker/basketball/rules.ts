// Pure basketball rules — foul-out, team-foul bonus, and stat-row creation.
// Framework-free so they unit-test directly and stay the single source of truth
// for the live indicators.

import type { BasketballPlayer, BasketballState } from '../types';

/** A blank stat line for one player on `teamId`. */
export function emptyPlayer(teamId: string): BasketballPlayer {
  return { teamId, secondsPlayed: 0, pts: 0, ast: 0, reb: 0, oreb: 0, dreb: 0, stl: 0, blk: 0, fg: 0, fga: 0, tp: 0, tpa: 0, ft: 0, fta: 0, to: 0, pf: 0 };
}

/**
 * A player's stat row, created blank when they have none yet — a late roster
 * addition, whose row `state.players` was built before they existed.
 *
 * EVERY WRITE PATH MUST GO THROUGH THIS. The tracker table renders a player with
 * no row as an ordinary row of zeros (it falls back to emptyPlayer), so reading
 * the map directly and bailing on undefined drops the stat with no visible
 * symptom whatsoever: the scorer taps +, the row still reads 0, and nothing
 * indicates it didn't land. That was a real bug — a player added to a team
 * mid-tournament could be selected, put on court and tapped all game while
 * recording precisely nothing.
 *
 * `teamId` null means the player is on neither roster, which stays a no-op.
 */
export function rowOrBlank(
  state: BasketballState,
  playerId: string,
  teamId: string | null,
): BasketballPlayer | null {
  return state.players[playerId] ?? (teamId ? emptyPlayer(teamId) : null);
}

/**
 * Players on either roster that `state.players` has no row for. Additive
 * reconciliation, mirroring the server's roster merge (services/rosterLifecycle):
 * it only ever reports MISSING players, never proposes removing one, because a
 * player dropped from a roster still owns the stats recorded under their id here.
 */
export function missingPlayerRows(
  state: BasketballState,
  sides: Array<{ teamId: string; players: { userId: string }[] }>,
): Array<{ userId: string; teamId: string }> {
  const missing: Array<{ userId: string; teamId: string }> = [];
  for (const side of sides) {
    for (const p of side.players) {
      if (!state.players[p.userId]) missing.push({ userId: p.userId, teamId: side.teamId });
    }
  }
  return missing;
}

/** Personal fouls that disqualify a player (FIBA / high-school / college). */
export const FOUL_OUT_LIMIT = 5;

/** Team fouls in a quarter that put the opponent in the bonus (FIBA). */
export const BONUS_THRESHOLD = 5;

export function isFouledOut(personalFouls: number, limit = FOUL_OUT_LIMIT): boolean {
  return personalFouls >= limit;
}

/** One foul away from fouling out — used to warn the scorer/coach. */
export function inFoulTrouble(personalFouls: number, limit = FOUL_OUT_LIMIT): boolean {
  return personalFouls === limit - 1;
}

export function teamInBonus(teamFoulsThisQuarter: number, threshold = BONUS_THRESHOLD): boolean {
  return teamFoulsThisQuarter >= threshold;
}

/** Team fouls recorded in a given quarter (1-based) from the per-quarter array. */
export function teamFoulsInQuarter(perQuarter: number[] | undefined, quarter: number): number {
  if (!perQuarter || quarter < 1) return 0;
  return perQuarter[quarter - 1] ?? 0;
}

/** Immutably bump the team-foul count for a quarter by ±1 (never below zero). */
export function bumpTeamFoul(perQuarter: number[] | undefined, quarter: number, dir: 1 | -1): number[] {
  const arr = [...(perQuarter ?? [])];
  const i = quarter - 1;
  if (i < 0) return arr;
  while (arr.length <= i) arr.push(0);
  arr[i] = Math.max(0, (arr[i] ?? 0) + dir);
  return arr;
}
