import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toHalfCourt, isBehindArc, shotValueMismatch,
  COURT_LENGTH_M, COURT_WIDTH_M, BASKET_INSET_M,
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

test('mismatch check flags a 2 keyed from behind the arc, and a 3 keyed from the paint', () => {
  const deep = at(BASKET_INSET_M + 8, COURT_WIDTH_M / 2);
  assert.equal(shotValueMismatch('FG2_MADE', deep.x, deep.y, 'LEFT'), 'EXPECTED_THREE');
  const paint = at(2, COURT_WIDTH_M / 2);
  assert.equal(shotValueMismatch('FG3_MISS', paint.x, paint.y, 'LEFT'), 'EXPECTED_TWO');
  // Agreement is silent, and free throws are never checked.
  assert.equal(shotValueMismatch('FG3_MADE', deep.x, deep.y, 'LEFT'), null);
  assert.equal(shotValueMismatch('FT_MADE', paint.x, paint.y, 'LEFT'), null);
});
