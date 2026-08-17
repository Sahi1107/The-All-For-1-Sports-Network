import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  foulOutLimit, isFouledOut, inFoulTrouble, teamInBonus, teamFoulPenalty, bonusLabel,
  teamFoulsInQuarter, bumpTeamFoul,
} from './rules.ts';

test('a player fouls out at the 5v5 limit (5), not before', () => {
  assert.equal(foulOutLimit('FIVE_V_FIVE'), 5);
  assert.equal(isFouledOut(4), false);
  assert.equal(isFouledOut(5), true);
  assert.equal(isFouledOut(6), true);
  assert.equal(inFoulTrouble(4), true);  // one away
  assert.equal(inFoulTrouble(3), false);
  assert.equal(inFoulTrouble(5), false); // already out, not "trouble"
});

test('3x3 never fouls a player out, and never warns about it', () => {
  // The rule that would otherwise have the tracker bench a player who is
  // entitled to keep playing.
  assert.equal(foulOutLimit('THREE_X_THREE'), null);
  assert.equal(isFouledOut(5, 'THREE_X_THREE'), false);
  assert.equal(isFouledOut(9, 'THREE_X_THREE'), false);
  assert.equal(inFoulTrouble(4, 'THREE_X_THREE'), false);
});

test('team enters the bonus at 5 fouls in a 5v5 quarter', () => {
  assert.equal(teamInBonus(4), false);
  assert.equal(teamInBonus(5), true);
  assert.equal(teamInBonus(7), true);
});

test('the 3x3 foul ladder: bonus at 7, bonus + possession at 10', () => {
  assert.equal(teamFoulPenalty(6, 'THREE_X_THREE'), 'NONE');
  assert.equal(teamFoulPenalty(7, 'THREE_X_THREE'), 'BONUS');
  assert.equal(teamFoulPenalty(9, 'THREE_X_THREE'), 'BONUS');
  assert.equal(teamFoulPenalty(10, 'THREE_X_THREE'), 'BONUS_AND_POSSESSION');
  // A 3x3 side is NOT in the bonus at five, where a 5v5 side would be.
  assert.equal(teamInBonus(5, 'THREE_X_THREE'), false);
  assert.equal(teamInBonus(5, 'FIVE_V_FIVE'), true);
});

test('the scoreboard label names the penalty, and says nothing when there is none', () => {
  assert.equal(bonusLabel(teamFoulPenalty(4)), null);
  assert.equal(bonusLabel(teamFoulPenalty(5)), 'BONUS');
  assert.equal(bonusLabel(teamFoulPenalty(10, 'THREE_X_THREE')), 'BONUS + BALL');
});

test('an absent variant reads as 5v5 — every session created before 3x3 existed', () => {
  assert.equal(isFouledOut(5, null), true);
  assert.equal(isFouledOut(5, undefined), true);
  assert.equal(teamInBonus(5, null), true);
});

test('team fouls are read per period (1-based), 0 when absent', () => {
  const perQ = [2, 5, 0];
  assert.equal(teamFoulsInQuarter(perQ, 1), 2);
  assert.equal(teamFoulsInQuarter(perQ, 2), 5);
  assert.equal(teamFoulsInQuarter(perQ, 4), 0); // no entry yet
  assert.equal(teamFoulsInQuarter(undefined, 1), 0);
});

test('bumping a foul grows the period array immutably and never goes below zero', () => {
  let perQ: number[] = [];
  perQ = bumpTeamFoul(perQ, 2, 1); // first foul, in Q2
  assert.deepEqual(perQ, [0, 1]);
  perQ = bumpTeamFoul(perQ, 2, 1);
  assert.equal(teamFoulsInQuarter(perQ, 2), 2);
  // undo below zero is clamped
  const q1 = bumpTeamFoul([0], 1, -1);
  assert.deepEqual(q1, [0]);
});

test('a full period of fouls crosses into the bonus exactly at the threshold', () => {
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
