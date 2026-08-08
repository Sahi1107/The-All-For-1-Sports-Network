import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBracket, seedPositions, seedFirstRound, seedOrderFromGroups, groupOfTeams,
  type GroupDef, type Standing,
} from './trackerDraw';

/** A finished group table, best first — only the order matters here. */
const table = (...teamIds: string[]): Standing[] =>
  teamIds.map((teamId, i) => ({
    teamId, played: 3, wins: 3 - i, draws: 0, losses: i,
    goalsFor: 0, goalsAgainst: 0, goalDifference: -i, points: (3 - i) * 3,
  }));

const groupsOf = (spec: Record<string, string[]>): GroupDef[] =>
  Object.entries(spec).map(([id, teamIds]) => ({ id, name: id, teamIds }));

/** The opening ties a draw produces, as [home, away] pairs. */
function ties(groups: GroupDef[], standings: Standing[], advancePerGroup: number) {
  const advancing = groups.length * advancePerGroup;
  const bracket = buildBracket(advancing, false);
  const order = seedOrderFromGroups(groups, standings, advancePerGroup);
  const { seeds } = seedFirstRound(bracket, order, groupOfTeams(groups));
  return seeds.map((s) => [s.home, s.away] as const);
}

test('standard seed positions put the top seeds in opposite halves', () => {
  assert.deepEqual(seedPositions(2), [1, 2]);
  assert.deepEqual(seedPositions(4), [1, 4, 2, 3]);
  assert.deepEqual(seedPositions(8), [1, 8, 4, 5, 2, 7, 3, 6]);
});

test('two groups of four: the semi-finals are A1 v B2 and B1 v A2', () => {
  // The real draw that exposed this: both semi-finals were an all-Group-A and an
  // all-Group-B tie, so two teams that had just played each other met again and
  // one group was guaranteed both finalists.
  const groups = groupsOf({
    A: ['pune', 'lourdes', 'baroda', 'ymcaPanjim'],
    B: ['redArmy', 'falcons', 'central', 'ymcaKnights'],
  });
  const standings = [
    ...table('pune', 'lourdes', 'baroda', 'ymcaPanjim'),
    ...table('redArmy', 'falcons', 'central', 'ymcaKnights'),
  ];
  assert.deepEqual(ties(groups, standings, 2), [
    ['pune', 'falcons'],     // A1 v B2
    ['redArmy', 'lourdes'],  // B1 v A2
  ]);
});

test('no first-round tie is ever two teams from the same group', () => {
  for (const groupCount of [2, 4]) {
    for (const advance of [1, 2]) {
      const spec: Record<string, string[]> = {};
      for (let g = 0; g < groupCount; g++) {
        const id = String.fromCharCode(65 + g);
        spec[id] = [0, 1, 2, 3].map((r) => `${id}${r}`);
      }
      const groups = groupsOf(spec);
      const standings = groups.flatMap((g) => table(...g.teamIds));
      const of = groupOfTeams(groups);
      for (const [home, away] of ties(groups, standings, advance)) {
        if (!home || !away) continue;
        assert.notEqual(
          of.get(home), of.get(away),
          `${groupCount} groups × ${advance}: ${home} v ${away} are both in ${of.get(home)}`,
        );
      }
    }
  }
});

test('four groups: every winner draws a runner-up from another group', () => {
  const groups = groupsOf({ A: ['A1', 'A2'], B: ['B1', 'B2'], C: ['C1', 'C2'], D: ['D1', 'D2'] });
  const standings = groups.flatMap((g) => table(...g.teamIds));
  assert.deepEqual(ties(groups, standings, 2), [
    ['A1', 'D2'], ['D1', 'A2'], ['B1', 'C2'], ['C1', 'B2'],
  ]);
});

test('three groups of two qualifiers: byes go to the best seeds, and the repair holds', () => {
  // 6 qualifiers into an 8-place bracket. Seeds 1 and 2 (the first two group
  // winners) draw places nobody occupies, so they get the byes — and seed 3's
  // own runner-up must be swapped away from it.
  const groups = groupsOf({ A: ['A1', 'A2'], B: ['B1', 'B2'], C: ['C1', 'C2'] });
  const standings = groups.flatMap((g) => table(...g.teamIds));
  const drawn = ties(groups, standings, 2);

  const byes = drawn.filter(([, away]) => away === null).map(([home]) => home);
  assert.deepEqual(byes.sort(), ['A1', 'B1'], 'the byes fall to the top two seeds');

  const of = groupOfTeams(groups);
  for (const [home, away] of drawn) {
    if (!home || !away) continue;
    assert.notEqual(of.get(home), of.get(away), `${home} v ${away} are group rivals`);
  }
});

test('a knockout-only draw still fills every place', () => {
  // No groups, so no group map — the shuffled order is paired as it stands.
  const bracket = buildBracket(8, false);
  const order = ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8'];
  const { seeds, byeAdvances } = seedFirstRound(bracket, order);
  assert.equal(seeds.length, 4);
  assert.equal(byeAdvances.length, 0);
  assert.deepEqual(seeds.flatMap((s) => [s.home, s.away]).sort(), [...order].sort());
});

test('a bye advances into the slot it feeds', () => {
  const bracket = buildBracket(4, false);
  const { seeds, byeAdvances } = seedFirstRound(bracket, ['a', 'b', 'c']);
  const bye = seeds.find((s) => s.bye)!;
  assert.ok(bye, 'three teams in a four-place bracket is one bye');
  assert.equal(bye.home, 'a', 'the bye goes to the top seed');
  assert.equal(byeAdvances.length, 1);
  assert.equal(byeAdvances[0].teamId, 'a');
});
