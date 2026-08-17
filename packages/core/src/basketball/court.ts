// Court geometry — ONE source for the SVG that gets clicked, the shot chart
// that gets drawn, and the arc check between them. If these drifted, an analyst
// could tap a spot the chart later renders somewhere else.
//
// All dimensions in metres, from the FIBA Official Basketball Rules and the
// FIBA 3x3 Rules of the Game.
//
// TWO PLAYING AREAS, ONE FRAME. A 5v5 court is 28 × 15 with a basket at each
// end, so a shot chart folds two half-courts onto one picture. A 3x3 court is
// 15 × 11 with a single basket, so what you click IS the chart — no projection,
// no ends to change. Both are described by the same CourtGeometry shape and read
// through the same toHalfCourt(), which is what lets the tracker, the chart and
// the arc check share code instead of forking per code.

import type { Basket } from './events';
import { type BasketballVariant, rulesFor } from './variant';

/** Everything a court's markings and its arc test are derived from. */
export interface CourtGeometry {
  /**
   * The rendered playing area, as clicked.
   *
   * `lengthM` runs along the attacking axis: baseline→baseline on a 5v5 court,
   * baseline→far edge on a 3x3 one. `widthM` runs sideline to sideline.
   */
  lengthM: number;
  widthM: number;
  /** Depth a shot chart frames, from the attacked baseline. Half the length when
   *  there are two baskets; the whole court when there is one. */
  chartDepthM: number;
  /** Whether the area has a basket at each end (and so teams that change ends). */
  twoBaskets: boolean;

  /** Basket centre, measured in from the baseline. */
  basketInsetM: number;
  /** Three-point arc radius, from the floor point below the basket centre. */
  threeRadiusM: number;
  /** The straight corner sections of the 3pt line sit this far off each sideline. */
  cornerInsetM: number;
  /** Rectangular key (paint): width across, depth from baseline. */
  keyWidthM: number;
  keyDepthM: number;
  /** Free-throw circle radius (the centre circle shares it on a 5v5 court). */
  circleRadiusM: number;
  /** No-charge semicircle under the basket. */
  restrictedRadiusM: number;
}

/** Markings common to both codes — the arc, the key and the basket are identical
 *  sizes; only the floor they sit on differs. */
const SHARED_MARKINGS = {
  basketInsetM: 1.575,
  threeRadiusM: 6.75,
  cornerInsetM: 0.9,
  keyWidthM: 4.9,
  keyDepthM: 5.8,
  circleRadiusM: 1.8,
  restrictedRadiusM: 1.25,
} as const;

/** Full FIBA court: 28 × 15, a basket at each end. */
export const COURT_5V5: CourtGeometry = {
  lengthM: 28,
  widthM: 15,
  chartDepthM: 14,
  twoBaskets: true,
  ...SHARED_MARKINGS,
};

/** FIBA 3x3 court: 15 wide × 11 long, one basket, played on half a floor. */
export const COURT_3X3: CourtGeometry = {
  lengthM: 11,
  widthM: 15,
  // The whole court is the chart — there is no far half to fold in.
  chartDepthM: 11,
  twoBaskets: false,
  ...SHARED_MARKINGS,
};

export function courtFor(variant?: BasketballVariant | string | null): CourtGeometry {
  return rulesFor(variant).twoBaskets ? COURT_5V5 : COURT_3X3;
}

// ─── Back-compatible 5v5 constants ───────────────────────────────────────────
// Kept as named exports because they read better than COURT_5V5.lengthM at the
// call sites that are unambiguously about a full court, and because dropping
// them would churn every existing import for no behavioural gain.
export const COURT_LENGTH_M = COURT_5V5.lengthM;
export const COURT_WIDTH_M = COURT_5V5.widthM;
export const BASKET_INSET_M = COURT_5V5.basketInsetM;
export const THREE_RADIUS_M = COURT_5V5.threeRadiusM;
export const CORNER_INSET_M = COURT_5V5.cornerInsetM;
export const KEY_WIDTH_M = COURT_5V5.keyWidthM;
export const KEY_DEPTH_M = COURT_5V5.keyDepthM;
export const CIRCLE_RADIUS_M = COURT_5V5.circleRadiusM;
export const RESTRICTED_RADIUS_M = COURT_5V5.restrictedRadiusM;
/** Half-court depth of a 5v5 floor — what its shot chart frames. */
export const HALF_LENGTH_M = COURT_5V5.chartDepthM;

/**
 * A shot in half-court terms, independent of which end it was taken at.
 *
 * `depthM`  — distance from the attacked baseline (0 = baseline)
 * `acrossM` — position across the court (0 = one sideline, `widthM` = the other)
 */
export interface HalfCourtPoint {
  depthM: number;
  acrossM: number;
  /** Normalised for rendering a chart: x across, y baseline→far edge. */
  hx: number;
  hy: number;
  /** Straight-line distance from the basket centre, in metres. */
  distanceM: number;
}

/**
 * Project a court click onto the attacked half.
 *
 * Input is normalised as rendered: x ∈ [0,1] along the length, y ∈ [0,1]
 * sideline→sideline (SVG orientation, +y down).
 *
 * Shots at the RIGHT basket are rotated 180° rather than mirrored on x alone.
 * A rotation preserves handedness, so a shot from the shooter's left wing lands
 * on the same side of the chart at both ends of the floor; mirroring would flip
 * left-wing and right-wing attempts into each other every time the teams
 * changed baskets, quietly corrupting the chart at halftime.
 *
 * On a one-basket court there is nothing to rotate and `basket` is ignored — a
 * stray 'RIGHT' (from a mis-set client, or a fixture whose code was corrected
 * after the fact) must not mirror a 3x3 chart that has no far end.
 */
export function toHalfCourt(
  x: number,
  y: number,
  basket: Basket,
  geo: CourtGeometry = COURT_5V5,
): HalfCourtPoint {
  const far = geo.twoBaskets && basket === 'RIGHT';
  const depthM = far ? (1 - x) * geo.lengthM : x * geo.lengthM;
  const acrossM = far ? (1 - y) * geo.widthM : y * geo.widthM;
  const dd = depthM - geo.basketInsetM;
  const da = acrossM - geo.widthM / 2;
  return {
    depthM,
    acrossM,
    hx: acrossM / geo.widthM,
    hy: Math.min(1, Math.max(0, depthM / geo.chartDepthM)),
    distanceM: Math.sqrt(dd * dd + da * da),
  };
}

/**
 * Is this spot behind the three-point line?
 *
 * Two regions, because the line is an arc closed off by two straight corner
 * sections: inside the corner bands the line is straight and the arc doesn't
 * apply, everywhere else it's the 6.75 m radius. (The two meet 2.99 m from the
 * baseline, which falls out of these numbers rather than being hard-coded.)
 *
 * Identical on both courts — 3x3 uses the same arc, which is precisely why the
 * same tap can mean 2 points in one code and 1 in the other without the geometry
 * changing at all.
 */
export function isBehindArc(
  p: Pick<HalfCourtPoint, 'acrossM' | 'distanceM'>,
  geo: CourtGeometry = COURT_5V5,
): boolean {
  const fromCentre = Math.abs(p.acrossM - geo.widthM / 2);
  if (fromCentre >= geo.widthM / 2 - geo.cornerInsetM) return true;
  return p.distanceM >= geo.threeRadiusM;
}

/**
 * Does a recorded shot's court position disagree with the zone the analyst
 * entered? Returns null when they agree.
 *
 * This never rejects the entry — the analyst saw the play and the key is the
 * decision. It exists so the UI can raise a "that looks like a 3" prompt, which
 * is how a mis-keyed shot gets caught during the game instead of surfacing in
 * the box score afterwards.
 *
 * Reported in ZONE terms rather than point terms, because the same mismatch is
 * worth different points in each code — the caller adds the value from its rules.
 */
export function shotValueMismatch(
  kind: string,
  x: number,
  y: number,
  basket: Basket,
  geo: CourtGeometry = COURT_5V5,
): 'EXPECTED_BEHIND_ARC' | 'EXPECTED_INSIDE_ARC' | null {
  const isBehindKind = kind === 'FG3_MADE' || kind === 'FG3_MISS';
  const isInsideKind = kind === 'FG2_MADE' || kind === 'FG2_MISS';
  if (!isBehindKind && !isInsideKind) return null;
  const behind = isBehindArc(toHalfCourt(x, y, basket, geo), geo);
  if (isInsideKind && behind) return 'EXPECTED_BEHIND_ARC';
  if (isBehindKind && !behind) return 'EXPECTED_INSIDE_ARC';
  return null;
}
