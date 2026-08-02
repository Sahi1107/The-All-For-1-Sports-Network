// Tournament rankings — derived from PUBLISHED per-match stat rows (BasketballStats
// / FootballStats / CricketStats). This is the source of truth for the Rankings
// page and the profile's ranking receipts. It MUST stay in step with the stat
// chain: recomputed whenever a match is published, corrected, or un-published — not
// only when an admin remembers to press a button (the old behaviour).
//
// Scoring is a per-match score averaged over a player's games in the tournament,
// then ranked descending. The pure pieces (scoreX, rankFromStats) carry no DB
// dependency so they unit-test directly; recalculate persists via an injectable db.
import prismaDefault from '../config/db';
import type { Sport } from '@prisma/client';

export type RankSport = 'BASKETBALL' | 'FOOTBALL' | 'CRICKET';
const RANK_SPORTS = new Set<string>(['BASKETBALL', 'FOOTBALL', 'CRICKET']);
const MODEL_BY_SPORT: Record<RankSport, 'basketballStats' | 'footballStats' | 'cricketStats'> = {
  BASKETBALL: 'basketballStats', FOOTBALL: 'footballStats', CRICKET: 'cricketStats',
};

const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

// ─── Per-match score functions (canonical weights) ────────────────────────────
export function scoreBasketball(s: Record<string, unknown>): number {
  const pts = n(s.points), reb = n(s.rebounds), ast = n(s.assists), stl = n(s.steals), blk = n(s.blocks), to = n(s.turnovers);
  return pts * 0.25 + reb * 0.15 + ast * 0.20 + stl * 0.10 + blk * 0.10
    + (pts + reb + ast + stl + blk - to) * 0.20;
}
export function scoreFootball(s: Record<string, unknown>): number {
  return n(s.goals) * 0.30 + n(s.assists) * 0.20 + n(s.passes) * 0.005 * 0.15
    + n(s.tackles) * 0.15 + n(s.saves) * 0.20;
}
export function scoreCricket(s: Record<string, unknown>): number {
  const sr = n(s.strikeRate), econ = n(s.economy);
  return n(s.runs) * 0.25 + n(s.wickets) * 5 * 0.25
    + (sr > 0 ? sr * 0.01 * 0.15 : 0) + (econ > 0 ? (12 - econ) * 0.15 : 0)
    + n(s.catches) * 2 * 0.10 + n(s.fours) * 0.5 * 0.05 + n(s.sixes) * 1 * 0.05;
}

const SCORER: Record<RankSport, (s: Record<string, unknown>) => number> = {
  BASKETBALL: scoreBasketball, FOOTBALL: scoreFootball, CRICKET: scoreCricket,
};

export interface RankedEntry { userId: string; rank: number; score: number }

/**
 * Floor for being ranked at all. A rostered player who never took the floor
 * scores exactly 0, and a leaderboard tail of 0.0 entries is a squad list, not a
 * ranking. The bar is 0.05 rather than 0 because the score is surfaced to one
 * decimal — anything below that renders as "0.0" and so is indistinguishable
 * from not having played, however it was arrived at. Negative scores (possible
 * when turnovers outweigh everything else) fall below it too.
 */
export const MIN_RANKED_SCORE = 0.05;
export const isRankable = (score: number): boolean => score >= MIN_RANKED_SCORE;

/**
 * Pure: per-match stat rows → ranked entries (average score per game, descending).
 * A player across multiple matches is aggregated once; changing a row (a
 * correction) or dropping rows (an un-publish) simply changes the input set, which
 * is exactly how the propagation is meant to work.
 */
export function rankFromStats(sport: RankSport, rows: Array<Record<string, unknown>>): RankedEntry[] {
  const scorer = SCORER[sport];
  const agg = new Map<string, { total: number; games: number }>();
  for (const r of rows) {
    const userId = r.userId;
    if (typeof userId !== 'string') continue;
    const cur = agg.get(userId) ?? { total: 0, games: 0 };
    cur.total += scorer(r);
    cur.games += 1;
    agg.set(userId, cur);
  }
  return [...agg.entries()]
    .map(([userId, d]) => ({ userId, score: Math.round((d.total / d.games) * 100) / 100 }))
    // Drop non-contributors BEFORE numbering, so ranks stay contiguous from 1
    // rather than leaving gaps where a 0.0 player used to sit.
    .filter((e) => isRankable(e.score))
    // Stable, deterministic order: score desc, then userId for ties.
    .sort((a, b) => b.score - a.score || a.userId.localeCompare(b.userId))
    .map((e, i) => ({ ...e, rank: i + 1 }));
}

// Minimal shape of the Prisma client this service touches — lets tests inject a fake.
export interface RankingDb {
  tournament: { findUnique: (a: { where: { id: string }; select: { sport: true } }) => Promise<{ sport: Sport } | null> };
  playerRanking: {
    deleteMany: (a: { where: { tournamentId: string } }) => Promise<unknown>;
    createMany: (a: { data: unknown[] }) => Promise<unknown>;
  };
  basketballStats: { findMany: (a: { where: { tournamentId: string } }) => Promise<Array<Record<string, unknown>>> };
  footballStats:   { findMany: (a: { where: { tournamentId: string } }) => Promise<Array<Record<string, unknown>>> };
  cricketStats:    { findMany: (a: { where: { tournamentId: string } }) => Promise<Array<Record<string, unknown>>> };
}

/**
 * Recompute + persist a tournament's rankings from its currently-published stats.
 * Idempotent (delete-then-recreate), so publish / correction / un-publish all
 * converge on the truth. Returns the number of ranked players. Never throws into
 * the caller's critical path when called fire-and-forget — callers should .catch.
 */
export async function recalculateTournamentRankings(
  tournamentId: string,
  db: RankingDb = prismaDefault as unknown as RankingDb,
): Promise<number> {
  const tournament = await db.tournament.findUnique({ where: { id: tournamentId }, select: { sport: true } });
  if (!tournament) return 0;
  const sport = tournament.sport as string;

  // Non-stat sport: ensure no stale rankings linger, then stop.
  if (!RANK_SPORTS.has(sport)) {
    await db.playerRanking.deleteMany({ where: { tournamentId } });
    return 0;
  }

  const rows = await db[MODEL_BY_SPORT[sport as RankSport]].findMany({ where: { tournamentId } });
  const ranked = rankFromStats(sport as RankSport, rows);

  await db.playerRanking.deleteMany({ where: { tournamentId } });
  if (ranked.length > 0) {
    await db.playerRanking.createMany({
      data: ranked.map((r) => ({
        userId: r.userId, tournamentId, sport, rank: r.rank, score: r.score, category: 'OVERALL',
      })),
    });
  }
  return ranked.length;
}
