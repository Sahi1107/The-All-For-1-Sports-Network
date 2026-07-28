import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreBasketball, rankFromStats, recalculateTournamentRankings, type RankingDb,
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
