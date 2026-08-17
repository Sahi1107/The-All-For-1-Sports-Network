import { test } from 'node:test';
import assert from 'node:assert/strict';
import { usesHeadToHeadTiebreak, type RankableMatch } from './groupRanking';
import { computeStandings } from './trackerDraw';

const game = (home: string, homeScore: number, awayScore: number, away: string): RankableMatch => ({
  homeTeamId: home, awayTeamId: away, homeScore, awayScore, status: 'PUBLISHED',
});

/**
 * The real Group B that exposed this.
 *
 * Red Army, Central Railways and Falcons all finish 2–1 in a three-way cycle,
 * and their OVERALL differences (+42 / +31 / +3) order them in a way the games
 * between them contradict. Under FIBA it is the head-to-head games that decide,
 * so Falcons take the second semi-final place from Central Railways despite a
 * far worse overall difference.
 */
const GROUP_B: RankableMatch[] = [
  // the cycle
  game('red', 71, 50, 'central'),
  game('central', 71, 60, 'falcons'),
  game('falcons', 82, 78, 'red'),
  // and what each did to the bottom team, which sets the overall differences
  game('red', 100, 75, 'ymca'),
  game('central', 116, 75, 'ymca'),
  game('falcons', 85, 75, 'ymca'),
];
const GROUP_B_TEAMS = ['red', 'central', 'falcons', 'ymca'];

test('the group table reproduces the recorded records and differences', () => {
  const table = computeStandings(GROUP_B_TEAMS, GROUP_B, 'BASKETBALL');
  const by = (id: string) => table.find((r) => r.teamId === id)!;
  assert.deepEqual(
    [by('red'), by('central'), by('falcons'), by('ymca')].map((r) => [r.played, r.wins, r.losses, r.goalDifference]),
    [[3, 2, 1, 42], [3, 2, 1, 31], [3, 2, 1, 3], [3, 0, 3, -76]],
  );
});

test('basketball: a three-way tie is broken on the games between the tied teams', () => {
  const order = computeStandings(GROUP_B_TEAMS, GROUP_B, 'BASKETBALL').map((r) => r.teamId);
  // Mini round-robin: every team 1–1, so wins separate nobody. Point difference
  // in those three games does: red +17, falcons −7, central −10.
  assert.deepEqual(order, ['red', 'falcons', 'central', 'ymca']);
});

test('basketball: the top two advancing are the head-to-head two, not the best differences', () => {
  const advancing = computeStandings(GROUP_B_TEAMS, GROUP_B, 'BASKETBALL').slice(0, 2).map((r) => r.teamId);
  assert.deepEqual(advancing, ['red', 'falcons']);
  assert.ok(!advancing.includes('central'), 'central had +31 overall and still misses out');
});

test('football keeps the FIFA ordering — overall difference first', () => {
  assert.equal(usesHeadToHeadTiebreak('FOOTBALL'), false);
  const order = computeStandings(GROUP_B_TEAMS, GROUP_B, 'FOOTBALL').map((r) => r.teamId);
  assert.deepEqual(order, ['red', 'central', 'falcons', 'ymca']);
});

test('an unspecified sport is unchanged from the old behaviour', () => {
  const order = computeStandings(GROUP_B_TEAMS, GROUP_B).map((r) => r.teamId);
  assert.deepEqual(order, ['red', 'central', 'falcons', 'ymca']);
});

test('two teams tied: the one that won the meeting ranks higher, whatever the differences', () => {
  const matches = [
    game('a', 60, 59, 'b'),    // b lost the head-to-head by 1 …
    game('b', 120, 60, 'c'),   // … but hammered the bottom team
    game('a', 70, 65, 'c'),
  ];
  const order = computeStandings(['a', 'b', 'c'], matches, 'BASKETBALL').map((r) => r.teamId);
  assert.deepEqual(order, ['a', 'b', 'c'], 'a beat b, so a is first despite b\'s far better difference');
});

test('the procedure restarts for teams still level, on a table rebuilt without the separated team', () => {
  // A beats everyone, so A separates on the first criterion. B, C and D are then
  // level at 1–2 and go back to the start — over a table containing ONLY their
  // games against each other. Their games against A must stop counting: those
  // margins (−1 / −40 / −5) would order them B, D, C, while the games that
  // actually remain order them D, C, B.
  const matches = [
    game('a', 100, 99, 'b'),
    game('a', 100, 60, 'c'),
    game('a', 100, 95, 'd'),
    game('b', 80, 70, 'c'),
    game('c', 80, 70, 'd'),
    game('d', 80, 40, 'b'),
  ];
  const order = computeStandings(['a', 'b', 'c', 'd'], matches, 'BASKETBALL').map((r) => r.teamId);
  assert.deepEqual(order, ['a', 'd', 'c', 'b']);
});

test('a tie nothing separates falls back to overall figures, and is stable', () => {
  // Two teams that have not met (a group still in progress), level on record.
  const matches = [
    game('a', 90, 70, 'c'),
    game('b', 80, 75, 'c'),
  ];
  const order = computeStandings(['a', 'b', 'c'], matches, 'BASKETBALL').map((r) => r.teamId);
  assert.deepEqual(order, ['a', 'b', 'c'], 'a\'s bigger overall margin decides what head-to-head cannot');
  // Same input, same answer — no drawing of lots at read time.
  assert.deepEqual(computeStandings(['b', 'a', 'c'], matches, 'BASKETBALL').map((r) => r.teamId), order);
});

test('unplayed and in-progress fixtures never count toward a tiebreak', () => {
  const matches: RankableMatch[] = [
    ...GROUP_B,
    { homeTeamId: 'central', awayTeamId: 'falcons', homeScore: 99, awayScore: 0, status: 'SCHEDULED' },
    { homeTeamId: 'central', awayTeamId: 'red', homeScore: 99, awayScore: 0, status: 'IN_PROGRESS' },
  ];
  const order = computeStandings(GROUP_B_TEAMS, matches, 'BASKETBALL').map((r) => r.teamId);
  assert.deepEqual(order, ['red', 'falcons', 'central', 'ymca']);
});

// ─── 3x3 tables ──────────────────────────────────────────────────────────────

test('3x3 pays a point for a loss, so a beaten side still outranks a no-show', () => {
  // The distinction 3-1-0 cannot draw. Both 'lost' and 'noshow' finish 0–1, but
  // only one of them actually played.
  const matches: RankableMatch[] = [
    game('won', 21, 15, 'lost'),
  ];
  const table = computeStandings(['won', 'lost', 'noshow'], matches, 'BASKETBALL_3X3');
  const by = (id: string) => table.find((r) => r.teamId === id)!;
  assert.equal(by('won').points, 2, 'a win is two');
  assert.equal(by('lost').points, 1, 'turning up and losing is one');
  assert.equal(by('noshow').points, 0, 'a side that has not played has nothing');
  assert.equal(table[0].teamId, 'won');
  assert.equal(table[table.length - 1].teamId, 'noshow');
});

test('the same fixtures score differently under the two codes', () => {
  const matches: RankableMatch[] = [game('a', 21, 18, 'b'), game('a', 21, 20, 'c')];
  const teams = ['a', 'b', 'c'];
  const five = computeStandings(teams, matches, 'BASKETBALL');
  const three = computeStandings(teams, matches, 'BASKETBALL_3X3');
  const pts = (t: typeof five, id: string) => t.find((r) => r.teamId === id)!.points;
  assert.deepEqual([pts(five, 'a'), pts(five, 'b'), pts(five, 'c')], [6, 0, 0]);
  assert.deepEqual([pts(three, 'a'), pts(three, 'b'), pts(three, 'c')], [4, 1, 1]);
});

test('3x3 breaks ties head-to-head, exactly as 5v5 does', () => {
  assert.equal(usesHeadToHeadTiebreak('BASKETBALL_3X3'), true);
  // The same three-way cycle, played to 21. Falcons beat Red, so they take the
  // place despite Red's better overall difference — the blowout argument holds
  // at any target score.
  const cycle: RankableMatch[] = [
    game('red', 21, 10, 'central'),
    game('central', 21, 18, 'falcons'),
    game('falcons', 21, 19, 'red'),
    game('red', 21, 12, 'ymca'),
    game('central', 21, 11, 'ymca'),
    game('falcons', 21, 20, 'ymca'),
  ];
  const order = computeStandings(['red', 'central', 'falcons', 'ymca'], cycle, 'BASKETBALL_3X3')
    .map((r) => r.teamId);
  assert.equal(order[3], 'ymca', 'the winless side is last');
  assert.equal(order.indexOf('falcons') < order.indexOf('central'), true,
    'falcons beat central head-to-head');
});

test('REGRESSION: the mini-table counts WINS, so 3x3 loss points cannot invert it', () => {
  // Under a mini-table scored on league points, 'b' would collect participation
  // points for losing to the very teams it is tied with. Counting wins is what
  // FIBA's criterion actually says, and it is the only reading that survives a
  // code paying for a loss.
  const matches: RankableMatch[] = [
    // a, b, c all finish 1-2 overall; among themselves a beat b and b beat c.
    game('a', 21, 19, 'b'),
    game('b', 21, 20, 'c'),
    game('c', 21, 18, 'a'),
    game('a', 10, 21, 'd'),
    game('b', 10, 21, 'd'),
    game('c', 10, 21, 'd'),
  ];
  const table = computeStandings(['a', 'b', 'c', 'd'], matches, 'BASKETBALL_3X3');
  assert.equal(table[0].teamId, 'd', 'the side that won everything is top');
  // a, b and c are level on wins among themselves (one each), so the ordering
  // falls through to point difference in those games — but crucially none of
  // them is promoted purely for having lost more often.
  const tied = table.slice(1).map((r) => r.teamId);
  assert.deepEqual([...tied].sort(), ['a', 'b', 'c']);
});
