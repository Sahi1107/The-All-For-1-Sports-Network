import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rulesFor, isVariant, disciplineKey, foulPenalty, isFouledOut, inFoulTrouble,
  standingsPointsFor, needsOvertime, gameStatus,
} from './variant';

const FIVE = rulesFor('FIVE_V_FIVE');
const THREE = rulesFor('THREE_X_THREE');

test('an unknown or absent variant reads as 5v5', () => {
  // Every tournament row that predates the column was played 5v5.
  assert.equal(rulesFor(null).variant, 'FIVE_V_FIVE');
  assert.equal(rulesFor(undefined).variant, 'FIVE_V_FIVE');
  assert.equal(rulesFor('NONSENSE').variant, 'FIVE_V_FIVE');
  assert.equal(isVariant('THREE_X_THREE'), true);
  assert.equal(isVariant('NONSENSE'), false);
});

test('the two codes score the same zones differently', () => {
  assert.deepEqual(FIVE.values, { insideArc: 2, behindArc: 3, freeThrow: 1 });
  assert.deepEqual(THREE.values, { insideArc: 1, behindArc: 2, freeThrow: 1 });
});

test('disciplineKey separates the two boards and leaves other sports alone', () => {
  assert.equal(disciplineKey('BASKETBALL', 'THREE_X_THREE'), 'BASKETBALL_3X3');
  assert.equal(disciplineKey('BASKETBALL', 'FIVE_V_FIVE'), 'BASKETBALL');
  assert.equal(disciplineKey('BASKETBALL', null), 'BASKETBALL');
  // A variant on a non-basketball sport is meaningless and must not rename it.
  assert.equal(disciplineKey('FOOTBALL', 'THREE_X_THREE'), 'FOOTBALL');
  assert.equal(disciplineKey('CRICKET', null), 'CRICKET');
});

test('3x3 never fouls a player out; 5v5 does at five', () => {
  assert.equal(isFouledOut(FIVE, 5), true);
  assert.equal(inFoulTrouble(FIVE, 4), true);
  // The rule that would bench a player who is entitled to keep playing.
  assert.equal(isFouledOut(THREE, 5), false);
  assert.equal(isFouledOut(THREE, 99), false);
  assert.equal(inFoulTrouble(THREE, 4), false);
});

test('the team-foul ladder: 5v5 bonus at 5, 3x3 at 7 then possession at 10', () => {
  assert.equal(foulPenalty(FIVE, 4), 'NONE');
  assert.equal(foulPenalty(FIVE, 5), 'BONUS');
  assert.equal(foulPenalty(FIVE, 12), 'BONUS', '5v5 has no further escalation');

  assert.equal(foulPenalty(THREE, 6), 'NONE');
  assert.equal(foulPenalty(THREE, 7), 'BONUS');
  assert.equal(foulPenalty(THREE, 9), 'BONUS');
  assert.equal(foulPenalty(THREE, 10), 'BONUS_AND_POSSESSION');
});

test('3x3 standings pay a point for turning up and losing', () => {
  assert.equal(standingsPointsFor(FIVE, 'win'), 3);
  assert.equal(standingsPointsFor(FIVE, 'loss'), 0);
  // FIBA 3x3: 2 for a win, 1 for a loss — a side that plays and loses must
  // outrank one that forfeits, which 3-1-0 cannot express.
  assert.equal(standingsPointsFor(THREE, 'win'), 2);
  assert.equal(standingsPointsFor(THREE, 'loss'), 1);
});

test('the target score ends a 3x3 game the moment it is reached', () => {
  const at = (homeScore: number, awayScore: number) =>
    gameStatus(THREE, { homeScore, awayScore, period: 1, homePeriodPoints: homeScore, awayPeriodPoints: awayScore });

  assert.equal(at(20, 19).over, false);
  assert.equal(at(20, 19).homeToTarget, 1);
  const won = at(21, 19);
  assert.equal(won.over, true);
  assert.equal(won.winner, 'HOME');
  assert.equal(won.reason, 'TARGET_SCORE');
  // Past the target (a two that takes 20 to 22) still ends it.
  assert.equal(at(22, 19).over, true);
});

test('a 5v5 game is never ended by this function', () => {
  const g = gameStatus(FIVE, { homeScore: 120, awayScore: 60, period: 4, homePeriodPoints: 30, awayPeriodPoints: 10 });
  assert.equal(g.over, false);
  assert.equal(g.homeToTarget, null, 'no target to count down to');
});

test('overtime is offered only when the clock expires on a level game', () => {
  const level = { homeScore: 18, awayScore: 18, period: 1 };
  assert.equal(needsOvertime(THREE, level, true), true);
  assert.equal(needsOvertime(THREE, level, false), false, 'time has not run out');
  assert.equal(needsOvertime(THREE, { homeScore: 18, awayScore: 17, period: 1 }, true), false);
  // 5v5 overtime is a normal timed period, added by the organiser.
  assert.equal(needsOvertime(FIVE, { homeScore: 80, awayScore: 80, period: 4 }, true), false);
});

test('3x3 is one period on one basket, 5v5 is four on two', () => {
  assert.equal(THREE.periods, 1);
  assert.equal(THREE.twoBaskets, false);
  assert.equal(THREE.playersOnCourt, 3);
  assert.equal(THREE.shotClockSeconds, 12);
  assert.equal(FIVE.periods, 4);
  assert.equal(FIVE.twoBaskets, true);
  assert.equal(FIVE.playersOnCourt, 5);
});
