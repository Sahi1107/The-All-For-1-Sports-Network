// FIBA court geometry — ONE source for the SVG that gets clicked, the shot chart
// that gets drawn, and the 2-vs-3 sanity check between them. If these drifted,
// an analyst could tap a spot the chart later renders somewhere else.
//
// All dimensions in metres, from the FIBA official basketball rules.

import type { Basket } from './events';

export const COURT_LENGTH_M = 28;
export const COURT_WIDTH_M = 15;
/** Basket centre, measured in from the baseline. */
export const BASKET_INSET_M = 1.575;
/** Three-point arc radius, from the floor point below the basket centre. */
export const THREE_RADIUS_M = 6.75;
/** The straight corner sections of the 3pt line sit this far off each sideline. */
export const CORNER_INSET_M = 0.9;
/** Rectangular key (paint): width across, depth from baseline. */
export const KEY_WIDTH_M = 4.9;
export const KEY_DEPTH_M = 5.8;
/** Free-throw circle and centre circle share a radius. */
export const CIRCLE_RADIUS_M = 1.8;
/** No-charge semicircle under the basket. */
export const RESTRICTED_RADIUS_M = 1.25;

/** Half-court depth — what a shot chart frames. */
export const HALF_LENGTH_M = COURT_LENGTH_M / 2;

/**
 * A shot in half-court terms, independent of which end it was taken at.
 *
 * `depthM`  — distance from the attacked baseline (0 = baseline, 14 = midcourt)
 * `acrossM` — position across the court (0 = one sideline, 15 = the other)
 */
export interface HalfCourtPoint {
  depthM: number;
  acrossM: number;
  /** Normalised for rendering a half-court chart: x across, y baseline→midcourt. */
  hx: number;
  hy: number;
  /** Straight-line distance from the basket centre, in metres. */
  distanceM: number;
}

/**
 * Project a full-court click onto the attacked half.
 *
 * Full-court input is normalised as rendered: x ∈ [0,1] baseline→baseline,
 * y ∈ [0,1] sideline→sideline (SVG orientation, +y down).
 *
 * Shots at the RIGHT basket are rotated 180° rather than mirrored on x alone.
 * A rotation preserves handedness, so a shot from the shooter's left wing lands
 * on the same side of the chart at both ends of the floor; mirroring would flip
 * left-wing and right-wing attempts into each other every time the teams
 * changed baskets, quietly corrupting the chart at halftime.
 */
export function toHalfCourt(x: number, y: number, basket: Basket): HalfCourtPoint {
  const depthM = basket === 'LEFT' ? x * COURT_LENGTH_M : (1 - x) * COURT_LENGTH_M;
  const acrossM = basket === 'LEFT' ? y * COURT_WIDTH_M : (1 - y) * COURT_WIDTH_M;
  const dd = depthM - BASKET_INSET_M;
  const da = acrossM - COURT_WIDTH_M / 2;
  return {
    depthM,
    acrossM,
    hx: acrossM / COURT_WIDTH_M,
    hy: Math.min(1, Math.max(0, depthM / HALF_LENGTH_M)),
    distanceM: Math.sqrt(dd * dd + da * da),
  };
}

/**
 * Is this spot behind the three-point line?
 *
 * Two regions, because the FIBA line is an arc closed off by two straight
 * corner sections: inside the corner bands the line is straight and the arc
 * doesn't apply, everywhere else it's the 6.75 m radius. (The two meet 2.99 m
 * from the baseline, which falls out of these numbers rather than being
 * hard-coded.)
 */
export function isBehindArc(p: Pick<HalfCourtPoint, 'acrossM' | 'distanceM'>): boolean {
  const fromCentre = Math.abs(p.acrossM - COURT_WIDTH_M / 2);
  if (fromCentre >= COURT_WIDTH_M / 2 - CORNER_INSET_M) return true;
  return p.distanceM >= THREE_RADIUS_M;
}

/**
 * Does a recorded shot's court position disagree with the value the analyst
 * entered? Returns null when they agree.
 *
 * This never rejects the entry — the analyst saw the play and the key is the
 * decision. It exists so the UI can raise a "that looks like a 3" prompt, which
 * is how a mis-keyed shot gets caught during the game instead of surfacing in
 * the box score afterwards.
 */
export function shotValueMismatch(
  kind: string,
  x: number,
  y: number,
  basket: Basket,
): 'EXPECTED_THREE' | 'EXPECTED_TWO' | null {
  const isThreeKind = kind === 'FG3_MADE' || kind === 'FG3_MISS';
  const isTwoKind = kind === 'FG2_MADE' || kind === 'FG2_MISS';
  if (!isThreeKind && !isTwoKind) return null;
  const behind = isBehindArc(toHalfCourt(x, y, basket));
  if (isTwoKind && behind) return 'EXPECTED_THREE';
  if (isThreeKind && !behind) return 'EXPECTED_TWO';
  return null;
}
