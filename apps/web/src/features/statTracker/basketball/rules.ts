// Live rule indicators for the tracker — foul-out and the team-foul bonus.
//
// These are thin wrappers over @af1/core's rules table rather than constants of
// their own. The two codes disagree on every number that used to live here: 5v5
// disqualifies a player at five personal fouls and enters the bonus at five team
// fouls; 3x3 has NO personal-foul disqualification at all and enters the bonus
// at seven, escalating to two shots plus possession at ten. Hard-coding either
// set would make the tracker bench a 3x3 player who is entitled to keep playing.
//
// The stat-row helpers that used to live here went with the state blob: a folded
// event log has no per-player map to be absent from, so there is nothing left to
// backfill. Everything below is genuine rules, not bookkeeping.

import {
  rulesFor,
  isFouledOut as coreIsFouledOut,
  inFoulTrouble as coreInFoulTrouble,
  foulPenalty,
  type BasketballVariant,
  type FoulPenalty,
} from '@af1/core';

/** Personal fouls that disqualify a player, or null where the code has no limit. */
export function foulOutLimit(variant?: BasketballVariant | null): number | null {
  return rulesFor(variant).foulOutLimit;
}

/** Is this player disqualified on personal fouls? Always false in 3x3. */
export function isFouledOut(personalFouls: number, variant?: BasketballVariant | null): boolean {
  return coreIsFouledOut(rulesFor(variant), personalFouls);
}

/** One foul away from fouling out — used to warn the scorer/coach. Never true in
 *  3x3, which has nothing to warn about. */
export function inFoulTrouble(personalFouls: number, variant?: BasketballVariant | null): boolean {
  return coreInFoulTrouble(rulesFor(variant), personalFouls);
}

/** Is the opponent shooting free throws on every foul? */
export function teamInBonus(teamFoulsThisPeriod: number, variant?: BasketballVariant | null): boolean {
  return foulPenalty(rulesFor(variant), teamFoulsThisPeriod) !== 'NONE';
}

/** The full penalty state — 3x3 escalates to two shots AND possession at ten. */
export function teamFoulPenalty(
  teamFoulsThisPeriod: number,
  variant?: BasketballVariant | null,
): FoulPenalty {
  return foulPenalty(rulesFor(variant), teamFoulsThisPeriod);
}

/** What the scoreboard prints next to a team's foul count. */
export function bonusLabel(penalty: FoulPenalty): string | null {
  if (penalty === 'BONUS_AND_POSSESSION') return 'BONUS + BALL';
  if (penalty === 'BONUS') return 'BONUS';
  return null;
}

/** Team fouls recorded in a given period (1-based) from the per-period array. */
export function teamFoulsInQuarter(perQuarter: number[] | undefined, quarter: number): number {
  if (!perQuarter || quarter < 1) return 0;
  return perQuarter[quarter - 1] ?? 0;
}

/** Immutably bump the team-foul count for a period by ±1 (never below zero). */
export function bumpTeamFoul(perQuarter: number[] | undefined, quarter: number, dir: 1 | -1): number[] {
  const arr = [...(perQuarter ?? [])];
  const i = quarter - 1;
  if (i < 0) return arr;
  while (arr.length <= i) arr.push(0);
  arr[i] = Math.max(0, (arr[i] ?? 0) + dir);
  return arr;
}
