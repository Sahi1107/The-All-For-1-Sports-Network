import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBracket, bracketAdvancements, seedFirstRound, generateDraw } from './trackerDraw';

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

// ─── Byes / non-power-of-2 knockouts ─────────────────────────
test('seedFirstRound places every team with no empty slots, across all counts', () => {
  for (let n = 2; n <= 32; n++) { // 32 = largest supported knockout bracket
    const bracket = buildBracket(n, true);
    const teams = Array.from({ length: n }, (_, i) => `T${i + 1}`);
    const { seeds, byeAdvances } = seedFirstRound(bracket, teams);
    const placed = seeds.flatMap((s) => [s.home, s.away]).filter(Boolean) as string[];
    // every team placed exactly once
    assert.equal(placed.length, n, `n=${n} placed count`);
    assert.equal(new Set(placed).size, n, `n=${n} placed unique`);
    // no first-round slot is fully empty (so byes never cascade)
    assert.equal(seeds.filter((s) => !s.home && !s.away).length, 0, `n=${n} empty slots`);
    // each bye produces exactly one parent advancement
    assert.equal(byeAdvances.length, seeds.filter((s) => s.bye).length, `n=${n} bye advances`);
  }
});

test('a 6-team knockout auto-advances byes and completes (no dead null-opponent matches)', () => {
  const draw = generateDraw('KNOCKOUT', ['A', 'B', 'C', 'D', 'E', 'F']);
  const first = draw.fixtures.filter((f) => f.stage === 'qf');
  const byes = first.filter((f) => (!!f.homeTeamId !== !!f.awayTeamId));
  // 8-team bracket, 2 byes; every bye fixture is COMPLETED (auto-resolved)
  assert.equal(byes.length, 2);
  for (const b of byes) assert.equal(b.status, 'COMPLETED');
  // the two bye teams appear pre-seeded in a later-round slot
  const byeTeams = byes.map((b) => b.homeTeamId ?? b.awayTeamId);
  const later = draw.fixtures.filter((f) => f.stage !== 'qf');
  const seededLater = new Set(later.flatMap((f) => [f.homeTeamId, f.awayTeamId]).filter(Boolean));
  for (const t of byeTeams) assert.ok(seededLater.has(t!), `bye team ${t} advanced`);
});

test('byes advance on the feed-position side (agrees with bracketAdvancements)', () => {
  // 3 teams -> [sf, final]; one sf slot is a bye that must feed the final on the
  // side matching feedFrom order, so the real semifinal winner fills the other.
  const bracket = buildBracket(3, false);
  const { seeds, byeAdvances } = seedFirstRound(bracket, ['A', 'B', 'C']);
  const byeSlot = seeds.find((s) => s.bye)!;
  const parent = bracket.slots.find((s) => (s.feedFrom ?? []).includes(byeSlot.slotId))!;
  const expectedSide = parent.feedFrom?.[0] === byeSlot.slotId ? 'home' : 'away';
  const adv = byeAdvances.find((a) => a.slotId === parent.id)!;
  assert.equal(adv.side, expectedSide);
});
