import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBracket } from './trackerDraw';
import {
  THIRD_PLACE_SLOT,
  bracketHasSemis,
  bracketHasThirdPlace,
  addThirdPlace,
  removeThirdPlace,
  thirdPlaceSeedFromSemis,
  thirdPlaceRemovalNeedsConfirm,
  thirdPlaceMatch,
} from './thirdPlace';

// Enabling on an existing draw: the slot must appear, fed by the two semis, so
// propagation routes the losing semifinalists into it.
test('addThirdPlace slots a third-place match fed by the two semifinals', () => {
  const bracket = buildBracket(4, /* includesThirdPlace */ false);
  assert.equal(bracketHasThirdPlace(bracket), false);

  const withTp = addThirdPlace(bracket);
  assert.equal(bracketHasThirdPlace(withTp), true);
  assert.equal(withTp.includesThirdPlace, true);
  assert.ok(withTp.stages.includes('third_place'));

  const slot = withTp.slots.find((s) => s.id === THIRD_PLACE_SLOT)!;
  const sfIds = bracket.slots.filter((s) => s.stage === 'sf').map((s) => s.id);
  assert.deepEqual(slot.feedFrom, [sfIds[0], sfIds[1]]);
});

test('addThirdPlace is idempotent (no duplicate slot)', () => {
  const once = addThirdPlace(buildBracket(4, false));
  const twice = addThirdPlace(once);
  assert.equal(twice.slots.filter((s) => s.stage === 'third_place').length, 1);
});

// Disabling on an existing draw: the slot + stage are stripped cleanly.
test('removeThirdPlace strips the slot and stage', () => {
  const bracket = buildBracket(4, true);
  assert.equal(bracketHasThirdPlace(bracket), true);

  const without = removeThirdPlace(bracket);
  assert.equal(bracketHasThirdPlace(without), false);
  assert.equal(without.includesThirdPlace, false);
  assert.ok(!without.stages.includes('third_place'));
  assert.equal(without.slots.some((s) => s.stage === 'third_place'), false);
});

// A third-place playoff needs semifinals — no semis, nothing to toggle.
test('bracketHasSemis: true for a 4-team draw, false without semis / no bracket', () => {
  assert.equal(bracketHasSemis(buildBracket(4, false)), true);
  assert.equal(bracketHasSemis(buildBracket(2, false)), false); // final only
  assert.equal(bracketHasSemis(null), false);
});

// Enabling after the semis are already played seeds the losers straight in.
test('thirdPlaceSeedFromSemis fills the losers of completed semifinals', () => {
  const bracket = addThirdPlace(buildBracket(4, false));
  const [sf1, sf2] = bracket.slots.filter((s) => s.stage === 'sf').map((s) => s.id);

  const seed = thirdPlaceSeedFromSemis(bracket, [
    { bracketSlot: sf1, homeTeamId: 'A', awayTeamId: 'B', homeScore: 2, awayScore: 1 }, // B loses
    { bracketSlot: sf2, homeTeamId: 'C', awayTeamId: 'D', homeScore: 0, awayScore: 3 }, // C loses
  ]);
  assert.deepEqual(seed, { home: 'B', away: 'C' });
});

test('thirdPlaceSeedFromSemis leaves sides null when semis are unplayed', () => {
  const bracket = addThirdPlace(buildBracket(4, false));
  assert.deepEqual(thirdPlaceSeedFromSemis(bracket, []), { home: null, away: null });
});

// The already-played gate: only a played match forces a confirmation.
test('thirdPlaceRemovalNeedsConfirm only when the match has a result', () => {
  assert.equal(thirdPlaceRemovalNeedsConfirm(null), false);
  assert.equal(thirdPlaceRemovalNeedsConfirm({ status: 'SCHEDULED' }), false);
  assert.equal(thirdPlaceRemovalNeedsConfirm({ status: 'IN_PROGRESS' }), false);
  assert.equal(thirdPlaceRemovalNeedsConfirm({ status: 'COMPLETED' }), true);
  assert.equal(thirdPlaceRemovalNeedsConfirm({ status: 'PUBLISHED' }), true);
});

test('thirdPlaceMatch finds the third-place fixture among the draw', () => {
  const matches = [
    { stage: 'sf' }, { stage: 'final' }, { stage: 'third_place' },
  ];
  assert.equal(thirdPlaceMatch(matches)?.stage, 'third_place');
  assert.equal(thirdPlaceMatch([{ stage: 'final' }]), null);
});
