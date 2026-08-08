import { test } from 'node:test';
import assert from 'node:assert/strict';
import { standingsFor } from './stats.ts';
import type { TrackerSession, TrackerMatch, TrackerSport } from './types.ts';

// Mirror of server/src/services/groupRanking.test.ts. The two implementations
// rank the same tables — the tracker's live view and the public one — so the
// same fixtures must produce the same order on both sides.

let seq = 0;
function game(home: string, homeScore: number, awayScore: number, away: string, stage = 'group'): TrackerMatch {
  return {
    id: `m${seq++}`, sessionId: 's', stage, round: 'Group B', groupId: 'gb',
    bracketSlot: null, feedsInto: null, orderIndex: seq,
    homeTeamId: home, awayTeamId: away, homeScore, awayScore,
    status: 'PUBLISHED', publishedMatchId: null, state: null,
  } as TrackerMatch;
}

function session(matches: TrackerMatch[], teamIds: string[], sport: TrackerSport = 'BASKETBALL'): TrackerSession {
  return {
    id: 's', tournamentId: 't', sport, format: 'MIXED',
    groups: [{ id: 'gb', name: 'Group B', teamIds }],
    bracket: null, config: null, matches,
    roster: teamIds.map((id) => ({ teamId: id, name: id, players: [] })),
  };
}

/** The real Group B: a three-way cycle at 2–1 whose overall differences
 *  (+42 / +31 / +3) contradict the games the tied teams played each other. */
const GROUP_B = [
  game('red', 71, 50, 'central'),
  game('central', 71, 60, 'falcons'),
  game('falcons', 82, 78, 'red'),
  game('red', 100, 75, 'ymca'),
  game('central', 116, 75, 'ymca'),
  game('falcons', 85, 75, 'ymca'),
];
const TEAMS = ['red', 'central', 'falcons', 'ymca'];

test('basketball: a three-way tie is broken on the games between the tied teams', () => {
  const order = standingsFor(session(GROUP_B, TEAMS), TEAMS).map((r) => r.teamId);
  assert.deepEqual(order, ['red', 'falcons', 'central', 'ymca']);
});

test('the tracker agrees with the public table on who advances', () => {
  const rows = standingsFor(session(GROUP_B, TEAMS), TEAMS);
  assert.deepEqual(rows.slice(0, 2).map((r) => r.teamId), ['red', 'falcons']);
  // …and still reports the records that made them tied in the first place.
  assert.deepEqual(rows.slice(0, 3).map((r) => [r.wins, r.losses]), [[2, 1], [2, 1], [2, 1]]);
});

test('football keeps the FIFA ordering — overall difference first', () => {
  const order = standingsFor(session(GROUP_B, TEAMS, 'FOOTBALL'), TEAMS).map((r) => r.teamId);
  assert.deepEqual(order, ['red', 'central', 'falcons', 'ymca']);
});

test('a knockout rematch does not count in the group it came out of', () => {
  // Falcons and Central meet again in the semi-final. That result is not a group
  // result: it must not touch P/W/L, and must not re-decide the group tiebreak.
  const withSemi = [...GROUP_B, game('falcons', 90, 60, 'central', 'sf')];
  const rows = standingsFor(session(withSemi, TEAMS), TEAMS);
  assert.deepEqual(rows.map((r) => r.played), [3, 3, 3, 3], 'still three group games each');
  assert.deepEqual(rows.map((r) => r.teamId), ['red', 'falcons', 'central', 'ymca']);
});
