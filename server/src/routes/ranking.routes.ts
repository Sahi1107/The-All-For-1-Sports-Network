import { Router, Response } from 'express';
import prisma from '../config/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { aiLimiter, browseLimiter } from '../middleware/rateLimiter';
import { recalculateTournamentRankings, MIN_RANKED_SCORE } from '../services/rankingService';
import type { Sport, Gender } from '@prisma/client';

const router = Router();

/**
 * Gender clause for a rankings query.
 *
 * `User.gender` is nullable and is only set when someone supplied it — a
 * provisioned athlete often has none. A strict equality match therefore dropped
 * those players from the men's board AND the women's board, so a player could
 * top the tournament's scoring and appear on no ranking anywhere. Unset gender
 * is now included on whichever board is being viewed: rankings are scoped to one
 * tournament, and a tournament is played in a single category, so the tournament
 * itself is the better evidence of which board a player belongs on than an
 * unfilled profile field.
 */
function genderWhere(gender: unknown): Record<string, unknown> {
  if (gender !== 'MALE' && gender !== 'FEMALE') return {};
  return { OR: [{ gender: gender as Gender }, { gender: null }] };
}

// GET /api/rankings
router.get('/', authenticate, browseLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { sport, tournamentId, category, region, gender, page = '1', limit = '50' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {};
    if (sport) where.sport = sport;
    if (tournamentId) where.tournamentId = tournamentId;
    if (category) where.category = category;
    if (region) where.region = region;
    // Filtered on read as well as at derivation: rankings are only recomputed on
    // publish / correction / un-publish, so rows persisted before the floor
    // existed would otherwise keep showing until something triggered a rebuild.
    where.score = { gte: MIN_RANKED_SCORE };
    // Men's and women's rankings are separate — filter on the athlete's gender.
    // Always exclude non-discoverable athletes (under-13 accounts by default).
    where.user = { discoverable: true, ...genderWhere(gender) };

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
router.get('/tournaments', authenticate, browseLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { sport, gender } = req.query;
    if (!sport) { res.status(400).json({ error: 'sport is required' }); return; }

    // Grouped rather than distinct: the card shows how many athletes are ranked,
    // which is the one number that tells a browser whether a tournament is worth
    // opening. Counted under the same visibility filters as the list itself, so
    // the card can't promise 20 players and then show 12.
    const grouped = await prisma.playerRanking.groupBy({
      by: ['tournamentId'],
      where: {
        sport: sport as Sport,
        // Same floor as the list — a tournament whose only rows are
        // non-contributors has no ranking to show, so it must not be offered
        // in the picker as though it did.
        score: { gte: MIN_RANKED_SCORE },
        user: { discoverable: true, ...genderWhere(gender) },
      },
      _count: { _all: true },
    });

    const counts = new Map(grouped.map((g) => [g.tournamentId, g._count?._all ?? 0]));
    const rows = await prisma.tournament.findMany({
      where: { id: { in: [...counts.keys()] } },
      select: {
        id: true, name: true, sport: true, thumbnailUrl: true,
        city: true, venue: true, startDate: true, endDate: true, status: true,
      },
    });

    const tournaments = rows
      .map((t) => ({ ...t, playerCount: counts.get(t.id) ?? 0 }))
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
