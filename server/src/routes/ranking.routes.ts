import { Router, Response } from 'express';
import prisma from '../config/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { aiLimiter, browseLimiter } from '../middleware/rateLimiter';
import { recalculateTournamentRankings, MIN_RANKED_SCORE } from '../services/rankingService';
import type { Sport, Gender } from '@prisma/client';

const router = Router();

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
    where.user = {
      discoverable: true,
      ...(gender === 'MALE' || gender === 'FEMALE' ? { gender } : {}),
    };

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

    const rows = await prisma.playerRanking.findMany({
      where: {
        sport: sport as Sport,
        // Same floor as the list itself — a tournament whose only rows are
        // non-contributors has no ranking to show, so it must not be offered
        // in the picker as though it did.
        score: { gte: MIN_RANKED_SCORE },
        user: {
          discoverable: true,
          ...(gender === 'MALE' || gender === 'FEMALE' ? { gender: gender as Gender } : {}),
        },
      },
      select: { tournamentId: true, tournament: { select: { id: true, name: true, startDate: true } } },
      distinct: ['tournamentId'],
    });

    const tournaments = rows
      .map((r) => r.tournament)
      .filter((t): t is NonNullable<typeof t> => !!t)
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
