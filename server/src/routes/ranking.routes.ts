import { Router, Response } from 'express';
import prisma from '../config/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { aiLimiter, browseLimiter } from '../middleware/rateLimiter';
import { recalculateTournamentRankings, MIN_RANKED_SCORE } from '../services/rankingService';
import { publicProfileWhere } from '../services/profileVisibility';
import { boardGenderFromQuery, tournamentOnBoard, shouldFilterByPlayerGender } from '../services/rankingGender';
import type { Sport, Gender } from '@prisma/client';

const router = Router();

/**
 * Per-player gender clause — the FALLBACK, used only for a tournament whose own
 * category makes no claim (MIXED / OPEN / unset). See services/rankingGender for
 * why the tournament's category is the primary rule.
 *
 * `User.gender` is nullable and is only set when someone supplied it — an
 * organiser-created athlete often has none. A strict equality match would drop
 * those players from the men's board AND the women's board, so a player could top
 * an uncategorised tournament's scoring and appear on no ranking anywhere. Unset
 * gender is therefore included on whichever board is being viewed.
 */
function genderWhere(gender: unknown): Record<string, unknown> {
  if (gender !== 'MALE' && gender !== 'FEMALE') return {};
  return { OR: [{ gender: gender as Gender }, { gender: null }] };
}

/**
 * The `user` clause every rankings query must use — visibility AND gender, in one
 * place so the list, the tournament picker and their counts can never disagree.
 *
 * Visibility is `publicProfileWhere()`, the same rule the profile 404 gate uses
 * (services/profileVisibility) — so a player who ranks here always has a profile
 * page that opens, and vice versa. In particular it admits UNCLAIMED profiles:
 * organiser-created players are `discoverable: false` to stay out of people-search
 * and Radar, but they played the matches and hiding them would falsify the very
 * standings this endpoint reports.
 *
 * Composed under AND because both halves contribute their own OR.
 */
function rankedUserWhere(gender: unknown): Record<string, unknown> {
  return { AND: [publicProfileWhere(), genderWhere(gender)] };
}

// GET /api/rankings
router.get('/', authenticate, browseLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { sport, tournamentId, category, region, gender, page = '1', limit = '50' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const board = boardGenderFromQuery(gender);

    const where: any = {};
    if (sport) where.sport = sport;
    if (tournamentId) where.tournamentId = tournamentId;
    if (category) where.category = category;
    if (region) where.region = region;
    // Filtered on read as well as at derivation: rankings are only recomputed on
    // publish / correction / un-publish, so rows persisted before the floor
    // existed would otherwise keep showing until something triggered a rebuild.
    where.score = { gte: MIN_RANKED_SCORE };

    // ── Which board does this belong on? ──
    // A single tournament's leaderboard (the normal case — the page always picks
    // one) is decided by THAT tournament's category: a women's tournament shows
    // under Women and nowhere else, whatever its players have on their profiles.
    // Only an uncategorised tournament falls back to per-player gender.
    let playerGenderFilter: unknown = gender;
    if (tournamentId && board) {
      const t = await prisma.tournament.findUnique({
        where: { id: tournamentId as string },
        select: { genderCategory: true },
      });
      if (!tournamentOnBoard(t?.genderCategory ?? null, board)) {
        // A men's tournament asked for on the women's board (or vice versa) has
        // no leaderboard here at all — return empty rather than a filtered subset.
        res.json({ rankings: [], total: 0, page: parseInt(page as string), totalPages: 0 });
        return;
      }
      if (!shouldFilterByPlayerGender(t?.genderCategory ?? null)) playerGenderFilter = undefined;
    }
    // Under-13 profiles never appear on a public board.
    where.user = rankedUserWhere(playerGenderFilter);

    const [rankings, total] = await Promise.all([
      prisma.playerRanking.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, avatar: true, position: true, location: true, verified: true, gender: true } },
          tournament: { select: { id: true, name: true } },
        },
        skip,
        take: parseInt(limit as string),
        orderBy: { rank: 'asc' },
      }),
      prisma.playerRanking.count({ where }),
    ]);

    res.json({ rankings, total, page: parseInt(page as string), totalPages: Math.ceil(total / parseInt(limit as string)) });
  } catch (error) {
    console.error('Get rankings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/rankings/tournaments?sport=&gender=
// The tournaments that actually have rankings for this sport (and, when given,
// this gender). Rankings are computed and stored PER TOURNAMENT, so the page
// picks one rather than merging every tournament into a single national board —
// merged, the rank column is meaningless because each tournament has its own #1.
//
// A tournament appears under the tab its OWN category says it belongs to: a
// women's tournament is offered under Women and nowhere else. Only a tournament
// with no category (MIXED / OPEN / blank) falls back to per-player gender, and so
// can appear under both. See services/rankingGender.
router.get('/tournaments', authenticate, browseLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { sport, gender } = req.query;
    if (!sport) { res.status(400).json({ error: 'sport is required' }); return; }
    const board = boardGenderFromQuery(gender);

    // Grouped rather than distinct: the card shows how many athletes are ranked,
    // which is the one number that tells a browser whether a tournament is worth
    // opening. Counted under the same visibility filters as the list itself, so
    // the card can't promise 20 players and then show 12.
    //
    // Two counts, because the two kinds of tournament are counted differently:
    // a CATEGORISED one counts everyone (the category already settled the board),
    // an UNCATEGORISED one counts only players matching the board's gender. Using
    // one number for both is what would make the card disagree with the list.
    const baseWhere = {
      sport: sport as Sport,
      // Same floor as the list — a tournament whose only rows are
      // non-contributors has no ranking to show, so it must not be offered
      // in the picker as though it did.
      score: { gte: MIN_RANKED_SCORE },
    };
    const [allGrouped, genderGrouped] = await Promise.all([
      prisma.playerRanking.groupBy({
        by: ['tournamentId'],
        where: { ...baseWhere, user: rankedUserWhere(undefined) },
        _count: { _all: true },
      }),
      board
        ? prisma.playerRanking.groupBy({
            by: ['tournamentId'],
            where: { ...baseWhere, user: rankedUserWhere(gender) },
            _count: { _all: true },
          })
        : Promise.resolve(null),
    ]);

    const allCounts = new Map(allGrouped.map((g) => [g.tournamentId, g._count?._all ?? 0]));
    const genderCounts = new Map((genderGrouped ?? allGrouped).map((g) => [g.tournamentId, g._count?._all ?? 0]));

    const rows = await prisma.tournament.findMany({
      where: { id: { in: [...allCounts.keys()] } },
      select: {
        id: true, name: true, sport: true, thumbnailUrl: true,
        city: true, venue: true, startDate: true, endDate: true, status: true,
        genderCategory: true,
      },
    });

    const tournaments = rows
      .filter((t) => tournamentOnBoard(t.genderCategory, board))
      .map((t) => {
        const byPlayer = shouldFilterByPlayerGender(t.genderCategory);
        const playerCount = (byPlayer ? genderCounts : allCounts).get(t.id) ?? 0;
        return { ...t, playerCount };
      })
      // An uncategorised tournament with nobody on THIS board isn't a leaderboard
      // — offering an empty card is worse than not offering it.
      .filter((t) => t.playerCount > 0)
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

    res.json({ tournaments });
  } catch (error) {
    console.error('Get ranking tournaments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/rankings/calculate/:tournamentId — manual recompute (admin override).
// The chain recomputes automatically on publish / correction / un-publish; this
// stays for a forced rebuild. Delegates to the shared service so both paths are
// guaranteed identical.
router.post('/calculate/:tournamentId', authenticate, requireRole('ADMIN'), aiLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const tournamentId = req.params.tournamentId as string;
    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { id: true } });
    if (!tournament) {
      res.status(404).json({ error: 'Tournament not found' });
      return;
    }
    const count = await recalculateTournamentRankings(tournamentId);
    res.json({ message: 'Rankings calculated', count });
  } catch (error) {
    console.error('Calculate rankings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
