import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FOUL_OUT_LIMIT, BONUS_THRESHOLD, isFouledOut, inFoulTrouble, teamInBonus,
  teamFoulsInQuarter, bumpTeamFoul,
} from './rules.ts';

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
// The row-backfill helpers that used to live here (emptyPlayer, rowOrBlank,
// missingPlayerRows) are gone with the state blob they defended.
//
// They existed because `state.players` was built once when a match was opened,
// while a roster keeps moving: a player added mid-tournament had no row, so every
// write path read the map, found nothing and silently bailed — they could be
// selected, put on court and tapped all game while recording nothing.
//
// Folding an event log has no such map to be missing from. A stat is recorded
// against a player id whether or not anything has been recorded for them before,
// and the fold creates their line when it first meets one (covered by
// @af1/core's "a stat entered for a player with no prior row creates one").
