/**
 * Unit tests for the pure career-stat aggregation (no DB). The DB helpers
 * (careerTotalsForUsers / userIdsMeetingStatThresholds) lazily import prisma, so
 * importing this module here triggers no side effects.
 *
 * Run with:  npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateCareerTotals,
  meetsThresholds,
  isStatSport,
  CAREER_STAT_FIELDS,
} from './careerStats';

// ─── aggregateCareerTotals ───────────────────────────────────────────────────

test('sums basketball match rows into career totals + match count', () => {
  const rows = [
    { points: 20, rebounds: 5, assists: 7, steals: 2, blocks: 1, threePointers: 3, freeThrows: 4, turnovers: 2, minutesPlayed: 32 },
    { points: 14, rebounds: 8, assists: 3, steals: 1, blocks: 0, threePointers: 1, freeThrows: 2, turnovers: 4, minutesPlayed: 28 },
  ];
  const c = aggregateCareerTotals('BASKETBALL', rows);
  assert.equal(c.matches, 2);
  assert.equal(c.totals.points, 34);
  assert.equal(c.totals.rebounds, 13);
  assert.equal(c.totals.assists, 10);
  assert.equal(c.totals.minutesPlayed, 60);
});

test('empty rows → zeroed totals and 0 matches', () => {
  const c = aggregateCareerTotals('FOOTBALL', []);
  assert.equal(c.matches, 0);
  assert.equal(c.totals.goals, 0);
  assert.equal(c.totals.assists, 0);
  // every canonical field is present and zero
  for (const f of CAREER_STAT_FIELDS.FOOTBALL) assert.equal(c.totals[f], 0);
});

test('coerces missing / null fields to 0 (partial rows)', () => {
  const rows = [
    { goals: 2 },                       // missing everything else
    { goals: null, assists: 3 } as any, // explicit null
  ];
  const c = aggregateCareerTotals('FOOTBALL', rows);
  assert.equal(c.matches, 2);
  assert.equal(c.totals.goals, 2);
  assert.equal(c.totals.assists, 3);
  assert.equal(c.totals.tackles, 0);
});

test('ignores columns outside the sport canonical set', () => {
  const rows = [{ runs: 50, wickets: 2, notAMetric: 999 } as any];
  const c = aggregateCareerTotals('CRICKET', rows);
  assert.equal(c.totals.runs, 50);
  assert.equal(c.totals.wickets, 2);
  assert.equal((c.totals as any).notAMetric, undefined);
});

// ─── meetsThresholds ─────────────────────────────────────────────────────────

test('meetsThresholds — all minimums satisfied (inclusive)', () => {
  const c = aggregateCareerTotals('BASKETBALL', [{ points: 20, assists: 10 }]);
  assert.equal(meetsThresholds(c, { points: 20 }), true);        // inclusive boundary
  assert.equal(meetsThresholds(c, { points: 20, assists: 10 }), true);
  assert.equal(meetsThresholds(c, { points: 21 }), false);       // just over
  assert.equal(meetsThresholds(c, { points: 20, assists: 11 }), false); // one fails
});

test('meetsThresholds — unknown metric treated as 0', () => {
  const c = aggregateCareerTotals('CRICKET', [{ runs: 100 }]);
  assert.equal(meetsThresholds(c, { goals: 1 }), false); // cricket has no goals → 0 < 1
  assert.equal(meetsThresholds(c, {}), true);            // no thresholds → passes
});

// ─── isStatSport ─────────────────────────────────────────────────────────────

test('isStatSport recognizes only the three stat sports', () => {
  assert.equal(isStatSport('BASKETBALL'), true);
  assert.equal(isStatSport('FOOTBALL'), true);
  assert.equal(isStatSport('CRICKET'), true);
  assert.equal(isStatSport('TENNIS'), false);
  assert.equal(isStatSport(null), false);
  assert.equal(isStatSport(undefined), false);
});
