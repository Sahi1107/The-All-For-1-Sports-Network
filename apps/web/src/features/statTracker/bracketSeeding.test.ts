import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedPositions, pairFirstRound, groupOfTeams } from './bracketSeeding.ts';

// Mirror of server/src/services/bracketSeeding.test.ts. The demo must draw the
// same bracket the product does, or it teaches the wrong thing.

test('standard seed positions put the top seeds in opposite halves', () => {
  assert.deepEqual(seedPositions(4), [1, 4, 2, 3]);
  assert.deepEqual(seedPositions(8), [1, 8, 4, 5, 2, 7, 3, 6]);
});

test('two groups: the semi-finals are A1 v B2 and B1 v A2', () => {
  const groups = [
    { id: 'A', teamIds: ['A1', 'A2'] },
    { id: 'B', teamIds: ['B1', 'B2'] },
  ];
  // Seed order is rank-major: both winners, then both runners-up.
  const ties = pairFirstRound(['A1', 'B1', 'A2', 'B2'], 2, groupOfTeams(groups));
  assert.deepEqual(ties, [
    { home: 'A1', away: 'B2' },
    { home: 'B1', away: 'A2' },
  ]);
});

test('no first-round tie is two teams from the same group', () => {
  const groups = [
    { id: 'A', teamIds: ['A1', 'A2'] },
    { id: 'B', teamIds: ['B1', 'B2'] },
    { id: 'C', teamIds: ['C1', 'C2'] },
  ];
  const of = groupOfTeams(groups);
  const ties = pairFirstRound(['A1', 'B1', 'C1', 'A2', 'B2', 'C2'], 4, of);
  for (const { home, away } of ties) {
    if (!home || !away) continue;
    assert.notEqual(of.get(home), of.get(away), `${home} v ${away} are group rivals`);
  }
  const byes = ties.filter((t) => !t.away).map((t) => t.home);
  assert.deepEqual(byes.sort(), ['A1', 'B1'], 'the byes fall to the top two seeds');
});

test('every qualifier is drawn exactly once', () => {
  const teams = ['A1', 'B1', 'C1', 'D1', 'A2', 'B2', 'C2', 'D2'];
  const drawn = pairFirstRound(teams, 4).flatMap((t) => [t.home, t.away]).filter(Boolean);
  assert.deepEqual([...drawn].sort(), [...teams].sort());
});
