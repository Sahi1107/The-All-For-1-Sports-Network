import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toHalfCourt, isBehindArc, shotValueMismatch,
  COURT_LENGTH_M, COURT_WIDTH_M, BASKET_INSET_M,
  COURT_5V5, COURT_3X3, courtFor,
} from './court';

/** Full-court normalised coords for a point given in metres from the LEFT baseline. */
const at = (depthM: number, acrossM: number) => ({
  x: depthM / COURT_LENGTH_M,
  y: acrossM / COURT_WIDTH_M,
});

test('a shot on the basket measures zero distance from it, at either end', () => {
  const left = at(BASKET_INSET_M, COURT_WIDTH_M / 2);
  assert.ok(toHalfCourt(left.x, left.y, 'LEFT').distanceM < 1e-9);
  // Same physical spot at the other end, attacking RIGHT.
  const right = at(COURT_LENGTH_M - BASKET_INSET_M, COURT_WIDTH_M / 2);
  assert.ok(toHalfCourt(right.x, right.y, 'RIGHT').distanceM < 1e-9);
});

test('the two ends fold onto ONE half-court frame', () => {
  // 5 m out, 2 m right of centre, at each end while attacking that end.
  const l = at(BASKET_INSET_M + 5, COURT_WIDTH_M / 2 + 2);
  const r = at(COURT_LENGTH_M - BASKET_INSET_M - 5, COURT_WIDTH_M / 2 - 2);
  const a = toHalfCourt(l.x, l.y, 'LEFT');
  const b = toHalfCourt(r.x, r.y, 'RIGHT');
  assert.ok(Math.abs(a.depthM - b.depthM) < 1e-9);
  assert.ok(Math.abs(a.acrossM - b.acrossM) < 1e-9);
});

test('REGRESSION: the far end is ROTATED, not mirrored — a left-wing shot stays left-wing', () => {
  // Rotation preserves the shooter's handedness. A mirror would flip left-wing
  // and right-wing attempts into each other every time teams changed baskets,
  // silently corrupting the chart at halftime.
  const leftWing = at(BASKET_INSET_M + 4, 3); // 3 m across = one side
  const sameSpotOtherEnd = at(COURT_LENGTH_M - BASKET_INSET_M - 4, COURT_WIDTH_M - 3);
  const a = toHalfCourt(leftWing.x, leftWing.y, 'LEFT');
  const b = toHalfCourt(sameSpotOtherEnd.x, sameSpotOtherEnd.y, 'RIGHT');
  assert.ok(Math.abs(a.acrossM - b.acrossM) < 1e-9, 'rotation keeps both on the same side of the chart');
});

test('three-point line: arc, corner band, and the paint', () => {
  const three = (depthM: number, acrossM: number) => {
    const p = at(depthM, acrossM);
    return isBehindArc(toHalfCourt(p.x, p.y, 'LEFT'));
  };
  // Straight on, 7 m from the basket — behind the 6.75 m arc.
  assert.equal(three(BASKET_INSET_M + 7, COURT_WIDTH_M / 2), true);
  // Straight on, 5 m — a long two.
  assert.equal(three(BASKET_INSET_M + 5, COURT_WIDTH_M / 2), false);
  // Corner, only 6 m from the basket but outside the 0.9 m corner line: a three.
  assert.equal(three(2, 0.5), true);
  // Layup.
  assert.equal(three(1.5, COURT_WIDTH_M / 2), false);
});

test('mismatch check flags an inside-arc key from deep, and a behind-arc key from the paint', () => {
  const deep = at(BASKET_INSET_M + 8, COURT_WIDTH_M / 2);
  assert.equal(shotValueMismatch('FG2_MADE', deep.x, deep.y, 'LEFT'), 'EXPECTED_BEHIND_ARC');
  const paint = at(2, COURT_WIDTH_M / 2);
  assert.equal(shotValueMismatch('FG3_MISS', paint.x, paint.y, 'LEFT'), 'EXPECTED_INSIDE_ARC');
  // Agreement is silent, and free throws are never checked.
  assert.equal(shotValueMismatch('FG3_MADE', deep.x, deep.y, 'LEFT'), null);
  assert.equal(shotValueMismatch('FT_MADE', paint.x, paint.y, 'LEFT'), null);
});

// ─── 3x3 ─────────────────────────────────────────────────────────────────────

test('courtFor picks the floor from the variant, and defaults to 5v5', () => {
  assert.equal(courtFor('THREE_X_THREE'), COURT_3X3);
  assert.equal(courtFor('FIVE_V_FIVE'), COURT_5V5);
  // A tournament row written before the variant column existed was 5v5.
  assert.equal(courtFor(null), COURT_5V5);
  assert.equal(courtFor(undefined), COURT_5V5);
});

test('the 3x3 court is 15 × 11 with one basket, and its chart frames the whole floor', () => {
  assert.equal(COURT_3X3.widthM, 15);
  assert.equal(COURT_3X3.lengthM, 11);
  assert.equal(COURT_3X3.twoBaskets, false);
  // Nothing is folded away: a shot at the far edge sits at the top of the chart.
  const far = toHalfCourt(1, 0.5, 'LEFT', COURT_3X3);
  assert.equal(far.depthM, 11);
  assert.equal(far.hy, 1);
});

test('REGRESSION: a stray RIGHT basket does not mirror a one-basket court', () => {
  // 3x3 has no far end to attack. A 'RIGHT' arriving from a mis-set client — or
  // from a fixture whose variant was corrected after some shots were logged —
  // must land on the same spot, not at the opposite end of a court that has none.
  const asLeft = toHalfCourt(0.25, 0.3, 'LEFT', COURT_3X3);
  const asRight = toHalfCourt(0.25, 0.3, 'RIGHT', COURT_3X3);
  assert.deepEqual(asRight, asLeft);
});

test('the arc is identical on both courts — the same spot, a different value', () => {
  // 7 m straight out from the basket, expressed on each court.
  const on = (geo: typeof COURT_3X3, depthM: number) =>
    isBehindArc(toHalfCourt(depthM / geo.lengthM, 0.5, 'LEFT', geo), geo);
  assert.equal(on(COURT_3X3, BASKET_INSET_M + 7), true);
  assert.equal(on(COURT_5V5, BASKET_INSET_M + 7), true);
  assert.equal(on(COURT_3X3, BASKET_INSET_M + 5), false);
  assert.equal(on(COURT_5V5, BASKET_INSET_M + 5), false);
});

test('the corner band still reads as behind the arc on a 3x3 floor', () => {
  // Same width, so the 0.9 m corner inset lands in the same place.
  const corner = toHalfCourt(2 / COURT_3X3.lengthM, 0.5 / COURT_3X3.widthM, 'LEFT', COURT_3X3);
  assert.equal(isBehindArc(corner, COURT_3X3), true);
});
