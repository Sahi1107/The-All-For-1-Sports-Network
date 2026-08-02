import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreBasketball, rankFromStats, recalculateTournamentRankings, isRankable,
  MIN_RANKED_SCORE, type RankingDb,
} from './rankingService';

// Rankings are the one link in the stat chain that is DERIVED and PERSISTED (a
// PlayerRanking table), so it can go stale. These tests pin the derivation and,
// crucially, that a correction or an un-publish re-derives correctly — the two
// propagation cases the chain must handle.

const bball = (userId: string, o: Partial<Record<string, number>>) => ({
  userId, points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0, ...o,
});

test('multi-player: ranked by average score, descending, deterministic ties', () => {
  const rows = [bball('a', { points: 20 }), bball('b', { points: 30 }), bball('c', { points: 10 })];
  const ranked = rankFromStats('BASKETBALL', rows);
  assert.deepEqual(ranked.map((r) => r.userId), ['b', 'a', 'c']);
  assert.deepEqual(ranked.map((r) => r.rank), [1, 2, 3]);
});

test('multi-match: a player’s rows are aggregated as an AVERAGE per game, not summed', () => {
  // Player a: two games averaging 20pts. Player b: one 25pt game.
  const rows = [bball('a', { points: 30 }), bball('a', { points: 10 }), bball('b', { points: 25 })];
  const ranked = rankFromStats('BASKETBALL', rows);
  const a = ranked.find((r) => r.userId === 'a')!;
  const b = ranked.find((r) => r.userId === 'b')!;
  // avg(a) = score(30) & score(10) averaged; both single-metric so a's avg = 20-equivalent < b's 25-equivalent.
  assert.equal(scoreBasketball(bball('a', { points: 30 })) > scoreBasketball(bball('a', { points: 10 })), true);
  assert.equal(b.rank < a.rank, true, 'the 25-avg player outranks the 20-avg player');
});

test('empty stats (nothing published / all un-published) → no ranked entries', () => {
  assert.deepEqual(rankFromStats('BASKETBALL', []), []);
});

// ─── The 0.0 floor ────────────────────────────────────────────────────────────
// A rostered player who never took the floor scores exactly 0. Listing them
// produced a leaderboard tail of identical "0.0" cards — a squad list, not a
// ranking.

test('players who did not contribute (score 0) are not ranked at all', () => {
  const rows = [
    bball('played', { points: 12 }),
    bball('dnp', {}),            // rostered, never took the floor
    bball('alsoDnp', {}),
  ];
  const ranked = rankFromStats('BASKETBALL', rows);
  assert.deepEqual(ranked.map((r) => r.userId), ['played']);
  assert.equal(ranked.length, 1, 'zero-score players are excluded entirely');
});

test('ranks stay contiguous from 1 — excluding a 0.0 player leaves no gap', () => {
  const rows = [
    bball('a', { points: 30 }), bball('zero', {}),
    bball('b', { points: 20 }), bball('c', { points: 10 }),
  ];
  const ranked = rankFromStats('BASKETBALL', rows);
  assert.deepEqual(ranked.map((r) => r.userId), ['a', 'b', 'c']);
  assert.deepEqual(ranked.map((r) => r.rank), [1, 2, 3]);
});

test('a negative score (turnovers outweighing everything) is not ranked', () => {
  // No production, three giveaways: (0+0+0+0+0-3) * 0.20 = -0.6
  const only = bball('sloppy', { turnovers: 3 });
  assert.equal(scoreBasketball(only) < 0, true);
  assert.deepEqual(rankFromStats('BASKETBALL', [only]), []);
});

test('the floor is display precision, not literal zero — sub-0.05 renders as "0.0"', () => {
  assert.equal(MIN_RANKED_SCORE, 0.05);
  assert.equal(isRankable(0), false);
  assert.equal(isRankable(0.04), false, '0.04 shows as 0.0 on the card');
  assert.equal((0.04).toFixed(1), '0.0');
  assert.equal(isRankable(0.05), true);
  assert.equal((0.05).toFixed(1), '0.1');
});

test('a tournament where nobody contributed persists no rankings', async () => {
  const { db, created } = fakeDb('BASKETBALL', [[bball('dnp1', {}), bball('dnp2', {})]]);
  const count = await recalculateTournamentRankings('t1', db);
  assert.equal(count, 0);
  assert.equal(created.length, 0, 'no rows written when nobody is rankable');
});

// ─── Propagation via the persisted recompute (injected fake db) ───────────────

function fakeDb(sport: string, statsByCall: Array<Array<Record<string, unknown>>>): {
  db: RankingDb; created: Array<Array<Record<string, unknown>>>;
} {
  const created: Array<Array<Record<string, unknown>>> = [];
  let call = 0;
  const db: RankingDb = {
    tournament: { findUnique: async () => ({ sport: sport as never }) },
    playerRanking: {
      deleteMany: async () => ({}),
      createMany: async (a) => { created.push(a.data as Array<Record<string, unknown>>); return {}; },
    },
    basketballStats: { findMany: async () => statsByCall[Math.min(call++, statsByCall.length - 1)] },
    footballStats: { findMany: async () => [] },
    cricketStats: { findMany: async () => [] },
  };
  return { db, created };
}

test('publish → persists ranked rows for the tournament', async () => {
  const { db, created } = fakeDb('BASKETBALL', [[bball('a', { points: 30 }), bball('b', { points: 10 })]]);
  const count = await recalculateTournamentRankings('t1', db);
  assert.equal(count, 2);
  assert.equal(created.length, 1);
  const rows = created[0] as Array<{ userId: string; rank: number; tournamentId: string; category: string }>;
  assert.equal(rows[0].userId, 'a'); // higher scorer ranked #1
  assert.equal(rows[0].rank, 1);
  assert.equal(rows[0].tournamentId, 't1');
  assert.equal(rows[0].category, 'OVERALL');
});

test('CORRECTION: re-running after a stat change flips the ranking', async () => {
  // First publish: a ahead of b. Correction lowers a's line below b's → recompute flips.
  const { db, created } = fakeDb('BASKETBALL', [
    [bball('a', { points: 30 }), bball('b', { points: 10 })], // before
    [bball('a', { points: 5 }),  bball('b', { points: 10 })], // after correction
  ]);
  await recalculateTournamentRankings('t1', db); // publish
  await recalculateTournamentRankings('t1', db); // re-publish after correction
  const first = created[0] as Array<{ userId: string; rank: number }>;
  const second = created[1] as Array<{ userId: string; rank: number }>;
  assert.equal(first.find((r) => r.rank === 1)!.userId, 'a');
  assert.equal(second.find((r) => r.rank === 1)!.userId, 'b'); // flipped after correction
});

test('UN-PUBLISH: when the stats are gone, rankings are cleared (delete, no recreate)', async () => {
  const { db, created } = fakeDb('BASKETBALL', [[]]); // no stats remain after un-publish
  const count = await recalculateTournamentRankings('t1', db);
  assert.equal(count, 0);
  assert.equal(created.length, 0, 'nothing recreated when there are no stats');
});

test('a non-stat sport clears any stale rankings and stops', async () => {
  const db: RankingDb = {
    tournament: { findUnique: async () => ({ sport: 'TENNIS' as never }) },
    playerRanking: { deleteMany: async () => ({}), createMany: async () => { throw new Error('should not create'); } },
    basketballStats: { findMany: async () => [] }, footballStats: { findMany: async () => [] }, cricketStats: { findMany: async () => [] },
  };
  const count = await recalculateTournamentRankings('t1', db);
  assert.equal(count, 0);
});
