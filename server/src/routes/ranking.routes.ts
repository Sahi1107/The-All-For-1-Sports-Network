import { Router, Response } from 'express';
import prisma from '../config/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { aiLimiter, browseLimiter } from '../middleware/rateLimiter';
import { recalculateTournamentRankings } from '../services/rankingService';

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
