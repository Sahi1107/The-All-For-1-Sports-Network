import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreBoard, rankBoard, recalculateTournamentRankings, isRankable,
  MIN_RANKED_SCORE, type RankingDb,
} from './rankingService';
import { RANKING_CONFIG, normalizeScore } from '@af1/core';

const BB = RANKING_CONFIG.BASKETBALL;
const overall = BB.overall;

const bball = (userId: string, o: Partial<Record<string, number>>) => ({
  userId, points: 0, offRebounds: 0, defRebounds: 0, assists: 0, steals: 0, blocks: 0,
  turnovers: 0, personalFouls: 0, freeThrows: 0, twoPointers: 0, threePointers: 0, ...o,
});

// ─── Ranking a board ──────────────────────────────────────────────────────────

test('ranked by score, descending, deterministic ties', () => {
  const ranked = rankBoard(overall, [bball('a', { points: 20 }), bball('b', { points: 30 }), bball('c', { points: 10 })]);
  assert.deepEqual(ranked.map((r) => r.userId), ['b', 'a', 'c']);
  assert.deepEqual(ranked.map((r) => r.rank), [1, 2, 3]);
});

test('a player’s rows are averaged per game, not summed', () => {
  const ranked = rankBoard(overall, [bball('a', { points: 30 }), bball('a', { points: 10 }), bball('b', { points: 25 })]);
  const a = ranked.find((r) => r.userId === 'a')!, b = ranked.find((r) => r.userId === 'b')!;
  assert.equal(b.rank < a.rank, true, 'the 25-avg player outranks the 20-avg player');
});

test('empty stats → no ranked entries', () => {
  assert.deepEqual(rankBoard(overall, []), []);
});

test('non-contributors (score 0) are excluded, ranks stay contiguous from 1', () => {
  const ranked = rankBoard(overall, [
    bball('a', { points: 30 }), bball('zero', {}), bball('b', { points: 20 }), bball('c', { points: 10 }),
  ]);
  assert.deepEqual(ranked.map((r) => r.userId), ['a', 'b', 'c']);
  assert.deepEqual(ranked.map((r) => r.rank), [1, 2, 3]);
});

// ─── The per-game floor at 0 (foul-out / turnover safeguard) ───────────────────

test('a game of only negatives floors to 0, not a runaway negative — and is not ranked', () => {
  const sloppy = bball('sloppy', { turnovers: 5, personalFouls: 5 }); // fouled out, five giveaways
  assert.equal(scoreBoard(overall, sloppy), 0, 'floored at 0, never negative');
  assert.deepEqual(rankBoard(overall, [sloppy]), []);
});

test('fouls only trim a productive game, never sink it below a quiet one', () => {
  const clean = scoreBoard(overall, bball('x', { points: 20, defRebounds: 6, assists: 4 }));
  const fouledOut = scoreBoard(overall, bball('x', { points: 20, defRebounds: 6, assists: 4, personalFouls: 5 }));
  assert.equal(fouledOut < clean, true, 'fouls reduce the score');
  assert.equal(fouledOut > 0, true, 'but a 20/6/4 game with a foul-out is still a strong, positive game');
});

// ─── 0–100 normalization ──────────────────────────────────────────────────────

test('scores are 0–100, capped, per-board REF', () => {
  assert.equal(normalizeScore(overall.ref, overall.ref), 90, 'the REF raw score reads as 90');
  assert.equal(normalizeScore(overall.ref * 2, overall.ref), 100, 'a monster game caps at 100');
  assert.equal(normalizeScore(0, overall.ref), 0);
  const ranked = rankBoard(overall, [bball('a', { points: 200, offRebounds: 50 })]);
  assert.equal(ranked[0].score <= 100, true, 'never exceeds 100');
});

test('per-board REF makes an 85 comparable across boards (PG vs BIG elite games map alike)', () => {
  const pg = BB.positions.find((b) => b.key === 'GUARD')!;
  const big = BB.positions.find((b) => b.key === 'CENTER')!;
  // An elite game per board (raw ≈ each REF) should land in the same high band.
  const pgElite = normalizeScore(pg.ref, pg.ref);
  const bigElite = normalizeScore(big.ref, big.ref);
  assert.equal(pgElite, bigElite, 'elite-for-the-board games normalize identically regardless of raw magnitude');
});

// ─── Position grouping ────────────────────────────────────────────────────────

test('position free text maps to the right board group', () => {
  // PG and SG are guards; SF and PF are forwards; C is a center.
  assert.equal(BB.groupOf('Point Guard'), 'GUARD');
  assert.equal(BB.groupOf('pg'), 'GUARD');
  assert.equal(BB.groupOf('Shooting Guard'), 'GUARD');
  assert.equal(BB.groupOf('sg'), 'GUARD');
  assert.equal(BB.groupOf('Small Forward'), 'FORWARD');
  assert.equal(BB.groupOf('Power Forward'), 'FORWARD');
  assert.equal(BB.groupOf('pf'), 'FORWARD');
  assert.equal(BB.groupOf('Center'), 'CENTER');
  assert.equal(BB.groupOf('Centre'), 'CENTER');
  assert.equal(BB.groupOf(''), null);
  assert.equal(BB.groupOf(null), null);
  assert.equal(RANKING_CONFIG.FOOTBALL.groupOf('Goalkeeper'), 'GK');
  assert.equal(RANKING_CONFIG.FOOTBALL.groupOf('Striker'), 'FWD');
  assert.equal(RANKING_CONFIG.CRICKET.groupOf('Bowler'), 'BOWL');
});

test('each board scores its own position\'s work — creation for guards, the glass for centers', () => {
  const guard = BB.positions.find((b) => b.key === 'GUARD')!;
  const center = BB.positions.find((b) => b.key === 'CENTER')!;
  const playmaking = bball('a', { assists: 8 });
  const rebounding = bball('a', { offRebounds: 5, defRebounds: 5 });
  assert.equal(scoreBoard(guard, playmaking) > scoreBoard(center, playmaking), true,
    'assists count on the guard board, not the center board');
  assert.equal(scoreBoard(center, rebounding) > scoreBoard(guard, rebounding), true,
    'rebounds count on the center board, not the guard board');
});

test('the guard board does not let creation bury a scoring guard (PG and SG share it)', () => {
  const guard = BB.positions.find((b) => b.key === 'GUARD')!;
  const scoringSG = scoreBoard(guard, bball('sg', { points: 24, assists: 2 }));
  const passingPG = scoreBoard(guard, bball('pg', { points: 6, assists: 8 }));
  assert.equal(scoringSG > passingPG, true,
    'a 24-point shooting guard outranks a 6-point, 8-assist point guard on a shared board');
});

// ─── Persisted recompute (injected fake db): overall + position + foul-out ────

function fakeDb(sport: string, statsByCall: Array<Array<Record<string, unknown>>>, positions: Record<string, string | null> = {}): {
  db: RankingDb; created: Array<Array<Record<string, unknown>>>;
} {
  const created: Array<Array<Record<string, unknown>>> = [];
  let call = 0;
  const db: RankingDb = {
    tournament: { findUnique: async () => ({ sport: sport as never }) },
    user: { findMany: async (a) => a.where.id.in.map((id) => ({ id, position: positions[id] ?? null })) },
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

test('recompute persists an OVERALL board plus each populated position board', async () => {
  const { db, created } = fakeDb('BASKETBALL',
    [[bball('pg', { assists: 10, points: 12 }), bball('big', { offRebounds: 6, defRebounds: 8, points: 18, blocks: 3 })]],
    { pg: 'Point Guard', big: 'Center' });
  const overallCount = await recalculateTournamentRankings('t1', db);
  const rows = created[0] as Array<{ userId: string; category: string; score: number; fouledOut: boolean; rank: number }>;
  const cats = new Set(rows.map((r) => r.category));
  assert.equal(overallCount, 2);
  assert.ok(cats.has('OVERALL') && cats.has('GUARD') && cats.has('CENTER'), 'overall + both position boards written');
  assert.equal(rows.filter((r) => r.category === 'GUARD').length, 1, 'only the guard is on the guard board');
  assert.equal(rows.filter((r) => r.category === 'CENTER').length, 1);
  assert.equal(rows.every((r) => r.score > 0 && r.score <= 100), true, 'all scores on the 0–100 scale');
});

test('a positionless player appears on OVERALL only — no position board until assigned', async () => {
  const { db, created } = fakeDb('BASKETBALL',
    [[bball('nopos', { points: 25, assists: 5 })]], { nopos: null });
  await recalculateTournamentRankings('t1', db);
  const rows = created[0] as Array<{ userId: string; category: string }>;
  assert.deepEqual([...new Set(rows.map((r) => r.category))], ['OVERALL']);
});

test('foul-out flag: set when a player hits the limit in any match, else false', async () => {
  const { db, created } = fakeDb('BASKETBALL',
    [[bball('fo', { points: 15, personalFouls: 5 }), bball('clean', { points: 20, personalFouls: 3 })]],
    { fo: 'Point Guard', clean: 'Point Guard' });
  await recalculateTournamentRankings('t1', db);
  const rows = created[0] as Array<{ userId: string; fouledOut: boolean }>;
  assert.equal(rows.filter((r) => r.userId === 'fo').every((r) => r.fouledOut === true), true);
  assert.equal(rows.filter((r) => r.userId === 'clean').every((r) => r.fouledOut === false), true);
});

test('CORRECTION re-running after a stat change flips the ranking', async () => {
  const { db, created } = fakeDb('BASKETBALL', [
    [bball('a', { points: 30 }), bball('b', { points: 10 })],
    [bball('a', { points: 5 }),  bball('b', { points: 10 })],
  ]);
  await recalculateTournamentRankings('t1', db);
  await recalculateTournamentRankings('t1', db);
  const first = (created[0] as Array<{ userId: string; rank: number; category: string }>).filter((r) => r.category === 'OVERALL');
  const second = (created[1] as Array<{ userId: string; rank: number; category: string }>).filter((r) => r.category === 'OVERALL');
  assert.equal(first.find((r) => r.rank === 1)!.userId, 'a');
  assert.equal(second.find((r) => r.rank === 1)!.userId, 'b');
});

test('UN-PUBLISH (no stats remain) clears rankings, recreates nothing', async () => {
  const { db, created } = fakeDb('BASKETBALL', [[]]);
  assert.equal(await recalculateTournamentRankings('t1', db), 0);
  assert.equal(created.length, 0);
});

test('a non-stat sport clears any stale rankings and stops', async () => {
  const db: RankingDb = {
    tournament: { findUnique: async () => ({ sport: 'TENNIS' as never }) },
    user: { findMany: async () => [] },
    playerRanking: { deleteMany: async () => ({}), createMany: async () => { throw new Error('should not create'); } },
    basketballStats: { findMany: async () => [] }, footballStats: { findMany: async () => [] }, cricketStats: { findMany: async () => [] },
  };
  assert.equal(await recalculateTournamentRankings('t1', db), 0);
});

test('the raw floor is 0.05 (a sub-floor average renders as ~0)', () => {
  assert.equal(MIN_RANKED_SCORE, 0.05);
  assert.equal(isRankable(0), false);
  assert.equal(isRankable(0.04), false);
  assert.equal(isRankable(0.05), true);
});
