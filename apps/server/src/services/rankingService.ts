// Tournament rankings — derived from PUBLISHED per-match stat rows (BasketballStats
// / FootballStats / CricketStats). Source of truth for the Rankings page + profile
// receipts; recomputed on every publish / correction / un-publish.
//
// Two board kinds per sport (see rankingConfig.ts for the tunable weights/REFs):
//   • OVERALL  — one positionless formula; the best player is visible wherever
//                they play.
//   • POSITION — separate boards scoring within a position group on suited
//                criteria. A player is placed on a board by their profile
//                position (user.position → rankingConfig.groupOf). No position
//                set ⇒ they appear on OVERALL only, until one is assigned.
//
// Each board score is a per-game average of a weighted stat sum, floored at 0 per
// game (a foul/turnover-heavy night contributes 0, never a runaway negative),
// then normalized to 0–100 by the board's REF so an 85 means a comparably strong
// game on every board. The pure pieces (scoreBoard/rankBoard) carry no DB
// dependency and unit-test directly; recalculate persists via an injectable db.
import prismaDefault from '../config/db';
import type { Sport, BasketballVariant } from '@prisma/client';
import {
  RANKING_CONFIG, FOUL_OUT_LIMIT, applyTransform, normalizeScore, disciplineKey, type Board,
} from '@af1/core';

export type RankSport = 'BASKETBALL' | 'FOOTBALL' | 'CRICKET';
const RANK_SPORTS = new Set<string>(['BASKETBALL', 'FOOTBALL', 'CRICKET']);
const MODEL_BY_SPORT: Record<RankSport, 'basketballStats' | 'footballStats' | 'cricketStats'> = {
  BASKETBALL: 'basketballStats', FOOTBALL: 'footballStats', CRICKET: 'cricketStats',
};

const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/**
 * Floor for being ranked at all — applied to the RAW per-game average (before
 * normalization). A rostered player who never took the floor scores exactly 0; a
 * tail of 0s is a squad list, not a ranking. 0.05 rather than 0 because a raw
 * average below that normalizes to ~0 and renders as "0" — indistinguishable from
 * not having played.
 */
export const MIN_RANKED_SCORE = 0.05;
export const isRankable = (rawScore: number): boolean => rawScore >= MIN_RANKED_SCORE;

/**
 * Raw board score for ONE match's stat row, floored at 0. Weighted by the board's
 * factors (rankingConfig). The per-game floor is the foul-out safeguard: fouls
 * (and turnovers) can pull a game toward 0 but never into a large negative that
 * would tank a player's tournament average.
 */
export function scoreBoard(board: Board, stats: Record<string, unknown>): number {
  let s = 0;
  for (const f of board.factors) s += f.weight * applyTransform(n(stats[f.field]), f.transform);
  return Math.max(0, s);
}

export interface RankedEntry { userId: string; rank: number; score: number } // score is 0–100

/**
 * Rank ONE board: per-game average of the board score, normalized to 0–100 by the
 * board's REF, non-contributors dropped BEFORE numbering (so ranks stay contiguous
 * from 1), descending, deterministic ties. `rows` = the stat rows of the players
 * that belong on this board.
 */
export function rankBoard(board: Board, rows: Array<Record<string, unknown>>): RankedEntry[] {
  const agg = new Map<string, { total: number; games: number }>();
  for (const r of rows) {
    const userId = r.userId;
    if (typeof userId !== 'string') continue;
    const cur = agg.get(userId) ?? { total: 0, games: 0 };
    cur.total += scoreBoard(board, r);
    cur.games += 1;
    agg.set(userId, cur);
  }
  return [...agg.entries()]
    .map(([userId, d]) => ({ userId, raw: d.games > 0 ? d.total / d.games : 0 }))
    .filter((e) => isRankable(e.raw))
    .map((e) => ({ userId: e.userId, score: normalizeScore(e.raw, board.ref) }))
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score || a.userId.localeCompare(b.userId))
    .map((e, i) => ({ ...e, rank: i + 1 }));
}

// Minimal Prisma shape this service touches — injectable so tests need no DB.
export interface RankingDb {
  tournament: {
    findUnique: (a: { where: { id: string }; select: { sport: true; variant: true } })
      => Promise<{ sport: Sport; variant: BasketballVariant | null } | null>;
  };
  user: { findMany: (a: { where: { id: { in: string[] } }; select: { id: true; position: true } }) => Promise<Array<{ id: string; position: string | null }>> };
  playerRanking: {
    deleteMany: (a: { where: { tournamentId: string } }) => Promise<unknown>;
    createMany: (a: { data: unknown[] }) => Promise<unknown>;
  };
  basketballStats: { findMany: (a: { where: { tournamentId: string } }) => Promise<Array<Record<string, unknown>>> };
  footballStats:   { findMany: (a: { where: { tournamentId: string } }) => Promise<Array<Record<string, unknown>>> };
  cricketStats:    { findMany: (a: { where: { tournamentId: string } }) => Promise<Array<Record<string, unknown>>> };
}

/**
 * Recompute + persist a tournament's rankings from its currently-published stats —
 * the OVERALL board plus every position board. Idempotent (delete-then-recreate),
 * so publish / correction / un-publish all converge. Returns the number ranked on
 * the OVERALL board. Fire-and-forget safe (callers .catch).
 */
export async function recalculateTournamentRankings(
  tournamentId: string,
  db: RankingDb = prismaDefault as unknown as RankingDb,
): Promise<number> {
  const tournament = await db.tournament.findUnique({ where: { id: tournamentId }, select: { sport: true, variant: true } });
  if (!tournament) return 0;
  const sport = tournament.sport as string;
  // 3x3 is the same sport but a different competition, scored on a different
  // scale (a basket is 1 or 2, a game ends at 21). It gets its own board — see
  // RANKING_CONFIG.BASKETBALL_3X3 — while the stats table, the sport filter and
  // everything else stay shared.
  const discipline = disciplineKey(sport, tournament.variant);
  const isThreeXThree = discipline === 'BASKETBALL_3X3';

  // Always clear first, so an un-publish (or a sport with no boards) leaves nothing stale.
  await db.playerRanking.deleteMany({ where: { tournamentId } });
  if (!RANK_SPORTS.has(sport)) return 0;

  const cfg = RANKING_CONFIG[discipline];
  const rows = await db[MODEL_BY_SPORT[sport as RankSport]].findMany({ where: { tournamentId } });
  if (!rows.length) return 0;

  // Position per player (for grouping) + foul-out flag (5v5 basketball only).
  const userIds = [...new Set(rows.map((r) => r.userId).filter((id): id is string => typeof id === 'string'))];
  const users = userIds.length ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, position: true } }) : [];
  const positionOf = new Map(users.map((u) => [u.id, u.position]));
  const fouledOut = new Set<string>();
  // 3x3 does not disqualify a player on personal fouls at all, so the flag is
  // never set there — showing "fouled out" against a player who was entitled to
  // keep playing would be a false accusation on a public leaderboard.
  if (sport === 'BASKETBALL' && !isThreeXThree) {
    for (const r of rows) {
      if (typeof r.userId === 'string' && n(r.personalFouls) >= FOUL_OUT_LIMIT) fouledOut.add(r.userId);
    }
  }

  // OVERALL board (everyone) + each position board (players whose position maps to it).
  const boards: Array<{ key: string; entries: RankedEntry[] }> = [
    { key: cfg.overall.key, entries: rankBoard(cfg.overall, rows) },
  ];
  for (const b of cfg.positions) {
    const groupRows = rows.filter((r) => typeof r.userId === 'string' && cfg.groupOf(positionOf.get(r.userId)) === b.key);
    if (groupRows.length) boards.push({ key: b.key, entries: rankBoard(b, groupRows) });
  }

  const data = boards.flatMap((b) => b.entries.map((e) => ({
    userId: e.userId, tournamentId, sport, rank: e.rank, score: e.score,
    category: b.key, fouledOut: fouledOut.has(e.userId),
  })));
  if (data.length > 0) await db.playerRanking.createMany({ data });

  return boards.find((b) => b.key === 'OVERALL')?.entries.length ?? 0;
}
