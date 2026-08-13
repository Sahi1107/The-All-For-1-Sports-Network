import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot } from './basketballSnapshot';
import { derivePlayerStats } from './trackerStats';
import type { TrackerEvent, EventKind, ControlPayload } from '@af1/core';

// The publish path end-to-end, minus the database: events → snapshot → the
// PlayerStatEntry rows that get written to a player's permanent record. This is
// the one derivation in the tracker that is genuinely irreversible in effect —
// it feeds profiles and the rankings — so it gets covered directly rather than
// trusted to the layers on either side of it.

const HOME = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AWAY = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const T0 = Date.parse('2026-08-13T18:00:00.000Z');

let seq = 0;
function ev(kind: EventKind, o: {
  playerId?: string; teamId?: string;
  x?: number; y?: number; basket?: 'LEFT' | 'RIGHT';
  quarter?: number; payload?: ControlPayload; atMs?: number; deleted?: boolean;
} = {}): TrackerEvent {
  seq += 1;
  return {
    id: `e${seq}`, matchId: 'm1', seq, kind,
    playerId: o.playerId ?? null, teamId: o.teamId ?? null,
    x: o.x ?? null, y: o.y ?? null, basket: o.basket ?? null,
    quarter: o.quarter ?? 1, clockMs: 0,
    payload: o.payload ?? null, clientId: `c${seq}`, actorId: 'admin',
    createdAt: new Date(T0 + (o.atMs ?? 0)).toISOString(),
    deletedAt: o.deleted ? new Date(T0).toISOString() : null,
  };
}
const opts = { homeTeamId: HOME, awayTeamId: AWAY, quarterSeconds: 600 };
const shot = (kind: EventKind, playerId: string) =>
  ev(kind, { playerId, teamId: HOME, x: 0.2, y: 0.5, basket: 'LEFT' as const });

test('a published box score matches what the analyst actually entered', () => {
  seq = 0;
  const events = [
    ev('LINEUP_SET', { teamId: HOME, payload: { side: 'home', lineup: ['p1'] } }),
    ev('CLOCK_START'),
    shot('FG2_MADE', 'p1'),
    shot('FG3_MADE', 'p1'),
    shot('FG3_MISS', 'p1'),
    ev('FT_MADE', { playerId: 'p1', teamId: HOME }),
    ev('FT_MISS', { playerId: 'p1', teamId: HOME }),
    ev('OREB', { playerId: 'p1', teamId: HOME }),
    ev('DREB', { playerId: 'p1', teamId: HOME }),
    ev('AST', { playerId: 'p1', teamId: HOME }),
    ev('STL', { playerId: 'p1', teamId: HOME }),
    ev('BLK', { playerId: 'p1', teamId: HOME }),
    ev('TO', { playerId: 'p1', teamId: HOME }),
    ev('PF', { playerId: 'p1', teamId: HOME }),
    ev('CLOCK_STOP', { atMs: 300_000 }), // 5 minutes played
  ];

  const snapshot = buildSnapshot(events, opts);
  const stats = derivePlayerStats('BASKETBALL', snapshot);
  const p1 = stats.find((s) => s.userId === 'p1');

  assert.deepEqual(p1?.stats, {
    points: 6,              // 2 + 3 + 1
    rebounds: 2,
    offRebounds: 1,
    defRebounds: 1,
    assists: 1,
    steals: 1,
    blocks: 1,
    twoPointers: 1,         // total FG (2) minus threes (1)
    threePointers: 1,
    freeThrows: 1,
    fieldGoalAttempts: 3,   // 2pt make + 3pt make + 3pt miss
    threePointAttempts: 2,
    freeThrowAttempts: 2,
    turnovers: 1,
    personalFouls: 1,
    minutesPlayed: 5,
  });
});

test('REGRESSION: a removed entry never reaches a player\'s permanent record', () => {
  // The "−" control is a soft delete. If the publish derivation folded deleted
  // rows, a wrong entry an analyst took back mid-game would still land on the
  // player's profile and in the rankings, where nobody would think to look.
  seq = 0;
  const snapshot = buildSnapshot([
    shot('FG3_MADE', 'p1'),
    ev('FG3_MADE', { playerId: 'p1', teamId: HOME, x: 0.2, y: 0.5, basket: 'LEFT', deleted: true }),
  ], opts);
  const p1 = derivePlayerStats('BASKETBALL', snapshot).find((s) => s.userId === 'p1');
  assert.equal(p1?.stats?.points, 3, 'only the entry that stood counts');
  assert.equal(p1?.stats?.threePointers, 1);
});

test('both sides of a game are derived, each against its own team', () => {
  seq = 0;
  const snapshot = buildSnapshot([
    ev('FG2_MADE', { playerId: 'home1', teamId: HOME, x: 0.2, y: 0.5, basket: 'LEFT' }),
    ev('FG3_MADE', { playerId: 'away1', teamId: AWAY, x: 0.8, y: 0.5, basket: 'RIGHT' }),
  ], opts);
  assert.equal(snapshot.players.home1.teamId, HOME);
  assert.equal(snapshot.players.away1.teamId, AWAY);
  assert.equal(derivePlayerStats('BASKETBALL', snapshot).length, 2);
});

test('shot locations survive into the snapshot so a finished match still charts', () => {
  seq = 0;
  const snapshot = buildSnapshot([
    shot('FG2_MADE', 'p1'),
    ev('FT_MADE', { playerId: 'p1', teamId: HOME }),
  ], opts);
  assert.equal(snapshot.shots.length, 1, 'free throws carry no location and are not plotted');
  assert.equal(snapshot.shots[0].made, true);
  assert.equal(snapshot.shots[0].playerId, 'p1');
});

test('the snapshot is flagged as derived, so nothing treats it as writable state', () => {
  seq = 0;
  const snapshot = buildSnapshot([shot('FG2_MADE', 'p1')], opts);
  assert.equal(snapshot.derivedFromEvents, true);
});
