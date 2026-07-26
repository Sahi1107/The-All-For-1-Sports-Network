import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBracket, bracketAdvancements } from './trackerDraw';

// Regression: with a third-place playoff enabled, a semifinal feeds BOTH the
// final (winner) and the third-place match (loser). Propagation must not drop
// the winner→final path (previously a single per-match pointer let the
// third-place slot overwrite it, leaving the final stuck on TBD).
test('semifinal winners advance to the final when a third-place playoff exists', () => {
  const bracket = buildBracket(4, /* includesThirdPlace */ true);
  const sf1 = bracket.slots.find((s) => s.stage === 'sf')!.id; // 'sf-1'
  const sf2 = bracket.slots.filter((s) => s.stage === 'sf')[1].id; // 'sf-2'
  const finalId = bracket.slots.find((s) => s.stage === 'final')!.id;
  const thirdId = bracket.slots.find((s) => s.stage === 'third_place')!.id;

  // SF1: home (A) beats away (B).
  const advSf1 = bracketAdvancements(bracket, {
    bracketSlot: sf1, homeTeamId: 'A', awayTeamId: 'B', homeScore: 2, awayScore: 1,
  });
  // SF2: away (D) beats home (C).
  const advSf2 = bracketAdvancements(bracket, {
    bracketSlot: sf2, homeTeamId: 'C', awayTeamId: 'D', homeScore: 0, awayScore: 3,
  });

  // Final receives BOTH winners, on the correct sides.
  assert.deepEqual(advSf1.find((a) => a.slotId === finalId), { slotId: finalId, side: 'home', teamId: 'A' });
  assert.deepEqual(advSf2.find((a) => a.slotId === finalId), { slotId: finalId, side: 'away', teamId: 'D' });

  // Third-place receives BOTH losers.
  assert.deepEqual(advSf1.find((a) => a.slotId === thirdId), { slotId: thirdId, side: 'home', teamId: 'B' });
  assert.deepEqual(advSf2.find((a) => a.slotId === thirdId), { slotId: thirdId, side: 'away', teamId: 'C' });
});

test('without a third-place playoff, a semifinal feeds only the final', () => {
  const bracket = buildBracket(4, false);
  const sf1 = bracket.slots.find((s) => s.stage === 'sf')!.id;
  const finalId = bracket.slots.find((s) => s.stage === 'final')!.id;

  const adv = bracketAdvancements(bracket, {
    bracketSlot: sf1, homeTeamId: 'A', awayTeamId: 'B', homeScore: 2, awayScore: 1,
  });
  assert.equal(adv.length, 1);
  assert.deepEqual(adv[0], { slotId: finalId, side: 'home', teamId: 'A' });
});

test('a drawn knockout match produces no advancements', () => {
  const bracket = buildBracket(4, true);
  const sf1 = bracket.slots.find((s) => s.stage === 'sf')!.id;
  const adv = bracketAdvancements(bracket, {
    bracketSlot: sf1, homeTeamId: 'A', awayTeamId: 'B', homeScore: 1, awayScore: 1,
  });
  assert.deepEqual(adv, []);
});
