import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FOUL_OUT_LIMIT, BONUS_THRESHOLD, isFouledOut, inFoulTrouble, teamInBonus,
  teamFoulsInQuarter, bumpTeamFoul, emptyPlayer, rowOrBlank, missingPlayerRows,
} from './rules.ts';
import type { BasketballState } from '../types.ts';

test('a player fouls out at the limit (5), not before', () => {
  assert.equal(isFouledOut(4), false);
  assert.equal(isFouledOut(FOUL_OUT_LIMIT), true);
  assert.equal(isFouledOut(6), true);
  assert.equal(inFoulTrouble(4), true);  // one away
  assert.equal(inFoulTrouble(3), false);
  assert.equal(inFoulTrouble(5), false); // already out, not "trouble"
});

test('team enters the bonus at 5 fouls in a quarter', () => {
  assert.equal(teamInBonus(4), false);
  assert.equal(teamInBonus(BONUS_THRESHOLD), true);
  assert.equal(teamInBonus(7), true);
});

test('team fouls are read per quarter (1-based), 0 when absent', () => {
  const perQ = [2, 5, 0];
  assert.equal(teamFoulsInQuarter(perQ, 1), 2);
  assert.equal(teamFoulsInQuarter(perQ, 2), 5);
  assert.equal(teamFoulsInQuarter(perQ, 4), 0); // no entry yet
  assert.equal(teamFoulsInQuarter(undefined, 1), 0);
});

test('bumping a foul grows the quarter array immutably and never goes below zero', () => {
  let perQ: number[] = [];
  perQ = bumpTeamFoul(perQ, 2, 1); // first foul, in Q2
  assert.deepEqual(perQ, [0, 1]);
  perQ = bumpTeamFoul(perQ, 2, 1);
  assert.equal(teamFoulsInQuarter(perQ, 2), 2);
  // undo below zero is clamped
  const q1 = bumpTeamFoul([0], 1, -1);
  assert.deepEqual(q1, [0]);
});

test('a full quarter of fouls crosses into the bonus exactly at the 5th', () => {
  let perQ: number[] = [];
  for (let i = 1; i <= 5; i++) perQ = bumpTeamFoul(perQ, 1, 1);
  assert.equal(teamInBonus(teamFoulsInQuarter(perQ, 1)), true);
  assert.equal(teamInBonus(teamFoulsInQuarter(bumpTeamFoul(perQ, 1, -1), 1)), false); // back to 4
});

// ── Late roster additions ────────────────────────────────────────────────────
// Regression: `state.players` is built once, when the match is first opened, but
// a roster keeps moving — an organiser can add a player mid-tournament. Such a
// player rendered as a normal row of zeros while every write path read the map,
// found nothing and silently bailed. They could be selected, put on court and
// tapped all game while recording nothing, with no symptom but the zeros.

const stateWith = (players: Record<string, ReturnType<typeof emptyPlayer>>) =>
  ({ players } as unknown as BasketballState);

test('rowOrBlank returns the existing row untouched when there is one', () => {
  const mine = { ...emptyPlayer('t1'), pts: 12, pf: 3 };
  const s = stateWith({ p1: mine });
  assert.equal(rowOrBlank(s, 'p1', 't1'), mine); // same object — no silent reset
});

test('rowOrBlank creates a blank row for a player with none (the bug)', () => {
  const s = stateWith({});
  const row = rowOrBlank(s, 'late-signing', 't1');
  assert.ok(row, 'a rostered player must always get a row to write into');
  assert.equal(row!.teamId, 't1');
  assert.equal(row!.pts, 0);
});

test('rowOrBlank still refuses a player on neither roster', () => {
  // teamId null = not on either side. That stays a no-op: inventing a row would
  // attach stats to someone who isn't in the match at all.
  assert.equal(rowOrBlank(stateWith({}), 'stranger', null), null);
});

test('a created row accumulates like any other', () => {
  const row = rowOrBlank(stateWith({}), 'late', 't1')!;
  const after = { ...row, pts: row.pts + 2, fg: row.fg + 1, fga: row.fga + 1 };
  assert.equal(after.pts, 2);
  assert.equal(after.fg, 1);
});

test('missingPlayerRows finds only players with no row, tagged to their side', () => {
  const s = stateWith({ a: emptyPlayer('home'), c: emptyPlayer('away') });
  const missing = missingPlayerRows(s, [
    { teamId: 'home', players: [{ userId: 'a' }, { userId: 'b' }] },
    { teamId: 'away', players: [{ userId: 'c' }, { userId: 'd' }] },
  ]);
  assert.deepEqual(missing, [
    { userId: 'b', teamId: 'home' },
    { userId: 'd', teamId: 'away' },
  ]);
});

test('missingPlayerRows reports nothing when every player already has a row', () => {
  // Matters because the caller writes state only when this is non-empty — a
  // false positive here would save on every render and loop.
  const s = stateWith({ a: emptyPlayer('home'), b: emptyPlayer('away') });
  const missing = missingPlayerRows(s, [
    { teamId: 'home', players: [{ userId: 'a' }] },
    { teamId: 'away', players: [{ userId: 'b' }] },
  ]);
  assert.deepEqual(missing, []);
});

test('missingPlayerRows never proposes removing a departed player', () => {
  // Additive only, mirroring the server's roster merge: a player dropped from the
  // roster still owns the stats recorded under their id in state.players.
  const s = stateWith({ gone: { ...emptyPlayer('home'), pts: 9 } });
  const missing = missingPlayerRows(s, [{ teamId: 'home', players: [] }]);
  assert.deepEqual(missing, []);
  assert.equal(s.players.gone.pts, 9);
});
