import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveTeamScore, validateBoxScore, validateSide, toPlayerStats, BoxScoreError,
  type BoxScoreInput,
} from './manualBoxScore';

// Pure logic only — publishBoxScore does I/O. What's pinned here is everything
// that decides whether a hand-typed sheet becomes CORRECT data: the derived
// result, the consistency rules, DNP handling, and the two conversions that
// bridge "how a box score is printed" and "how the schema stores it".

/** A valid basketball line: 4 FG (1 from three) + 1 FT = 3+3+2+1... see below. */
const line = (over: Partial<Record<string, number>> = {}) => ({
  points: 10, fieldGoalsMade: 4, fieldGoalAttempts: 11,
  threePointers: 1, threePointAttempts: 3,
  freeThrows: 1, freeThrowAttempts: 2,
  rebounds: 6, offRebounds: 0, assists: 2, steals: 1, blocks: 0,
  turnovers: 1, personalFouls: 0, minutesPlayed: 20,
  ...over,
});
// 3 two-pointers (6) + 1 three (3) + 1 free throw (1) = 10 ✓

const bs = (home: any[], away: any[]): BoxScoreInput => ({ home, away });

// ─── The box score IS the result ─────────────────────────────────────────────

test('team score is summed from the players, not typed', () => {
  const input = bs(
    [
      { userId: 'a', played: true, stats: line({ points: 8 }) },
      { userId: 'b', played: true, stats: line({ points: 10 }) },
      { userId: 'c', played: true, stats: line({ points: 5 }) },
    ],
    [{ userId: 'd', played: true, stats: line({ points: 22 }) }],
  );
  assert.equal(deriveTeamScore('BASKETBALL' as never, input.home), 23);
  assert.equal(deriveTeamScore('BASKETBALL' as never, input.away), 22);
});

test('DNP players contribute nothing to the score', () => {
  const rows = [
    { userId: 'a', played: true, stats: line({ points: 8 }) },
    { userId: 'b', played: false },
  ];
  assert.equal(deriveTeamScore('BASKETBALL' as never, rows), 8);
});

test('football scores from goals, cricket from runs', () => {
  assert.equal(
    deriveTeamScore('FOOTBALL' as never, [
      { userId: 'a', played: true, stats: { goals: 2, shots: 4 } },
      { userId: 'b', played: true, stats: { goals: 1, shots: 3 } },
    ]), 3);
  assert.equal(
    deriveTeamScore('CRICKET' as never, [
      { userId: 'a', played: true, stats: { runs: 45 } },
      { userId: 'b', played: true, stats: { runs: 30 } },
    ]), 75);
});

// ─── DNP means NO ROW (the rankings-correctness rule) ────────────────────────

test('a DNP writes no stat row at all', () => {
  // Rankings average per game as total/rows — a zero row for someone who didn't
  // dress would count as a bad game and drag their average down. Absence is the
  // only correct encoding.
  const stats = toPlayerStats('BASKETBALL' as never, bs(
    [
      { userId: 'played', played: true, stats: line() },
      { userId: 'dnp', played: false },
    ],
    [],
  ));
  assert.equal(stats.length, 1);
  assert.equal(stats[0].userId, 'played');
  assert.ok(!stats.some((s) => s.userId === 'dnp'));
});

test('a sheet where everyone is DNP is rejected', () => {
  assert.throws(
    () => validateBoxScore('BASKETBALL' as never, bs([{ userId: 'a', played: false }], [{ userId: 'b', played: false }])),
    (e: BoxScoreError) => e.code === 'EMPTY_BOX_SCORE',
  );
});

// ─── Basketball consistency ──────────────────────────────────────────────────

test('a coherent line passes', () => {
  assert.doesNotThrow(() => validateSide('BASKETBALL' as never, [{ userId: 'a', played: true, stats: line() }], 'home'));
});

test('points must match the shooting line exactly', () => {
  assert.throws(
    () => validateSide('BASKETBALL' as never, [{ userId: 'a', played: true, stats: line({ points: 11 }) }], 'home'),
    (e: BoxScoreError) => e.code === 'POINTS_MISMATCH' && e.field === 'home.0.points',
  );
});

test('makes cannot exceed attempts', () => {
  for (const [made, att] of [['fieldGoalsMade', 'fieldGoalAttempts'], ['threePointers', 'threePointAttempts'], ['freeThrows', 'freeThrowAttempts']]) {
    assert.throws(
      () => validateSide('BASKETBALL' as never, [{ userId: 'a', played: true, stats: line({ [made]: 9, [att]: 2 }) }], 'home'),
      BoxScoreError, `${made} > ${att} must be rejected`,
    );
  }
});

test('threes are a SUBSET of field goals — 3PM > FGM is rejected', () => {
  // FGM/FGA are totals INCLUDING threes on a printed sheet. If 3PM could exceed
  // FGM, twoPointers (= FGM − 3PM) would go negative and corrupt the stat row.
  assert.throws(
    () => validateSide('BASKETBALL' as never, [{ userId: 'a', played: true, stats: line({ fieldGoalsMade: 2, threePointers: 3, threePointAttempts: 4 }) }], 'home'),
    BoxScoreError,
  );
});

test('offensive rebounds cannot exceed the total', () => {
  assert.throws(
    () => validateSide('BASKETBALL' as never, [{ userId: 'a', played: true, stats: line({ rebounds: 3, offRebounds: 5 }) }], 'home'),
    BoxScoreError,
  );
});

test('negative stats are rejected', () => {
  assert.throws(
    () => validateSide('BASKETBALL' as never, [{ userId: 'a', played: true, stats: line({ assists: -2 }) }], 'home'),
    BoxScoreError,
  );
});

test('a DNP line is not held to the consistency rules', () => {
  assert.doesNotThrow(() =>
    validateSide('BASKETBALL' as never, [{ userId: 'a', played: false, stats: line({ points: 999 }) }], 'home'));
});

// ─── Duplicates ──────────────────────────────────────────────────────────────

test('the same player cannot appear twice on one side', () => {
  assert.throws(
    () => validateSide('BASKETBALL' as never, [
      { userId: 'a', played: true, stats: line() },
      { userId: 'a', played: true, stats: line() },
    ], 'home'),
    (e: BoxScoreError) => e.code === 'DUPLICATE_PLAYER',
  );
});

test('the same player cannot appear on both teams', () => {
  assert.throws(
    () => validateBoxScore('BASKETBALL' as never, bs(
      [{ userId: 'a', played: true, stats: line() }],
      [{ userId: 'a', played: true, stats: line() }],
    )),
    (e: BoxScoreError) => e.code === 'DUPLICATE_PLAYER',
  );
});

// ─── Conversion to the stored schema ─────────────────────────────────────────

test('FGM is split into two- and three-pointers for storage', () => {
  const [s] = toPlayerStats('BASKETBALL' as never, bs([{ userId: 'a', played: true, stats: line() }], []));
  // 4 field goals of which 1 was a three ⇒ 3 twos.
  assert.equal(s.stats!.twoPointers, 3);
  assert.equal(s.stats!.threePointers, 1);
  assert.equal(s.stats!.fieldGoalAttempts, 11); // attempts stored as the total
});

test('an unsplit rebound total is credited as DEFENSIVE, never invented as offensive', () => {
  // The ranking score weights offRebounds/defRebounds, not the total — so a
  // sheet with only a REB column must still produce credit, and the conservative
  // (lower-weighted) reading is the honest one.
  const [s] = toPlayerStats('BASKETBALL' as never, bs(
    [{ userId: 'a', played: true, stats: line({ rebounds: 7, offRebounds: 0 }) }], []));
  assert.equal(s.stats!.rebounds, 7);
  assert.equal(s.stats!.offRebounds, 0);
  assert.equal(s.stats!.defRebounds, 7);
});

test('an explicit offensive split is preserved exactly', () => {
  const [s] = toPlayerStats('BASKETBALL' as never, bs(
    [{ userId: 'a', played: true, stats: line({ rebounds: 7, offRebounds: 3 }) }], []));
  assert.equal(s.stats!.offRebounds, 3);
  assert.equal(s.stats!.defRebounds, 4);
});

test('cricket rates are DERIVED, so a correction cannot leave them stale', () => {
  const [s] = toPlayerStats('CRICKET' as never, bs(
    [{ userId: 'a', played: true, stats: { runs: 50, ballsFaced: 40, oversBowled: 4, runsConceded: 24 } }], []));
  assert.equal(s.stats!.strikeRate, 125);   // 50/40
  assert.equal(s.stats!.economy, 6);        // 24/4
});

test('cricket rates are 0 (not NaN/Infinity) with a zero denominator', () => {
  const [s] = toPlayerStats('CRICKET' as never, bs(
    [{ userId: 'a', played: true, stats: { runs: 0, ballsFaced: 0, oversBowled: 0, runsConceded: 0 } }], []));
  assert.equal(s.stats!.strikeRate, 0);
  assert.equal(s.stats!.economy, 0);
});

// ─── Football + cricket line rules ───────────────────────────────────────────

test('goals cannot exceed shots', () => {
  assert.throws(
    () => validateSide('FOOTBALL' as never, [{ userId: 'a', played: true, stats: { goals: 3, shots: 1 } }], 'home'),
    BoxScoreError,
  );
});

test('boundaries cannot exceed runs scored', () => {
  assert.throws(
    () => validateSide('CRICKET' as never, [{ userId: 'a', played: true, stats: { runs: 10, fours: 4, sixes: 0 } }], 'home'),
    BoxScoreError,
  );
});

// ─── Sport support ───────────────────────────────────────────────────────────

test('a sport with no stat tables is rejected rather than silently writing nothing', () => {
  assert.throws(
    () => validateBoxScore('ATHLETICS' as never, bs([{ userId: 'a', played: true, stats: {} }], [])),
    (e: BoxScoreError) => e.code === 'UNSUPPORTED_SPORT',
  );
});
