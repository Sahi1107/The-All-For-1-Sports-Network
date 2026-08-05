import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBracket, bracketAdvancements, seedFirstRound, generateDraw, groupRoundRobin } from './trackerDraw';

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

test('groupRoundRobin generates a full single round-robin (C(n,2), each pair once)', () => {
  const fx = groupRoundRobin({ id: 'g', name: 'Group A', teamIds: ['A', 'B', 'C', 'D'] }, 5);
  assert.equal(fx.length, 6); // C(4,2)
  assert.equal(fx[0].orderIndex, 5); // continues from startOrder
  assert.ok(fx.every((f) => f.stage === 'group' && f.groupId === 'g' && f.round === 'Group A'));
  const pairs = new Set(fx.map((f) => [f.homeTeamId, f.awayTeamId].sort().join('-')));
  assert.equal(pairs.size, 6); // every pair exactly once
});

// ─── Group fixture reconciliation ────────────────────────────────────────────
// Editing a group must only ever re-plan fixtures that HAVEN'T been played.

import { planGroupFixtures, isPlayed, type ExistingGroupMatch } from './trackerDraw';

const m = (id: string, home: string, away: string, status = 'SCHEDULED'): ExistingGroupMatch =>
  ({ id, homeTeamId: home, awayTeamId: away, status });
const grp = (teamIds: string[]) => ({ id: 'g1', name: 'Group A', teamIds });

test('isPlayed: only SCHEDULED is unplayed', () => {
  assert.equal(isPlayed('SCHEDULED'), false);
  assert.equal(isPlayed('IN_PROGRESS'), true);
  assert.equal(isPlayed('COMPLETED'), true);
  assert.equal(isPlayed('PUBLISHED'), true);
  assert.equal(isPlayed(null), false);
});

test('adding a team creates only its NEW pairings, keeping everything else', () => {
  const existing = [m('ab', 'a', 'b'), m('ac', 'a', 'c'), m('bc', 'b', 'c')];
  const plan = planGroupFixtures(grp(['a', 'b', 'c', 'd']), existing, 100);
  assert.deepEqual(plan.remove, [], 'nothing removed — every old pairing is still valid');
  assert.deepEqual(plan.keep.sort(), ['ab', 'ac', 'bc']);
  const created = plan.create.map((f) => [f.homeTeamId, f.awayTeamId].sort().join('|')).sort();
  assert.deepEqual(created, ['a|d', 'b|d', 'c|d'], 'only the new team\'s fixtures are added');
});

test('a PLAYED fixture is never removed, even when a team leaves the group', () => {
  const existing = [m('ab', 'a', 'b', 'COMPLETED'), m('ac', 'a', 'c')];
  // 'b' is moved out; its completed match against 'a' must survive.
  const plan = planGroupFixtures(grp(['a', 'c']), existing, 10);
  assert.ok(plan.keep.includes('ab'), 'the played match is kept');
  assert.deepEqual(plan.remove, [], 'ac is still a valid pairing');
  assert.deepEqual(plan.playedTeamIds.sort(), ['a', 'b']);
});

test('an unplayed fixture whose pairing is gone is removed', () => {
  const existing = [m('ab', 'a', 'b'), m('ac', 'a', 'c'), m('bc', 'b', 'c')];
  const plan = planGroupFixtures(grp(['a', 'c']), existing, 10);
  assert.deepEqual(plan.remove.sort(), ['ab', 'bc'], 'both fixtures involving the removed team go');
  assert.deepEqual(plan.keep, ['ac']);
  assert.deepEqual(plan.create, [], 'a-c already exists');
});

test('a played pairing is not recreated as a duplicate', () => {
  const existing = [m('ab', 'a', 'b', 'PUBLISHED')];
  const plan = planGroupFixtures(grp(['a', 'b', 'c']), existing, 5);
  const created = plan.create.map((f) => [f.homeTeamId, f.awayTeamId].sort().join('|')).sort();
  assert.deepEqual(created, ['a|c', 'b|c'], 'a|b is already covered by the played match');
});

test('pairing identity ignores home/away order', () => {
  // Stored as b-vs-a; the round robin would generate a-vs-b. Same fixture.
  const plan = planGroupFixtures(grp(['a', 'b']), [m('ba', 'b', 'a')], 1);
  assert.deepEqual(plan.create, [], 'not duplicated in the other orientation');
  assert.deepEqual(plan.keep, ['ba']);
});

test('an in-progress match blocks nothing but is preserved', () => {
  const plan = planGroupFixtures(grp(['a', 'b', 'c']), [m('ab', 'a', 'b', 'IN_PROGRESS')], 1);
  assert.ok(plan.keep.includes('ab'));
  assert.equal(plan.remove.length, 0);
  assert.equal(plan.create.length, 2, 'a|c and b|c still to be scheduled');
});

test('created fixtures continue the order index from where it was told to start', () => {
  const plan = planGroupFixtures(grp(['a', 'b', 'c']), [], 42);
  assert.deepEqual(plan.create.map((f) => f.orderIndex), [42, 43, 44]);
});

test('an empty group removes its unplayed fixtures and creates none', () => {
  const plan = planGroupFixtures(grp([]), [m('ab', 'a', 'b')], 1);
  assert.deepEqual(plan.remove, ['ab']);
  assert.deepEqual(plan.create, []);
});
