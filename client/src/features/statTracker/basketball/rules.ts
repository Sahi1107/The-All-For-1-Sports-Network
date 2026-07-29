// Pure basketball rules — foul-out and team-foul bonus. Framework-free so they
// unit-test directly and stay the single source of truth for the live indicators.

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
