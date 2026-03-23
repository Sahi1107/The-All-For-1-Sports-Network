import { Router, Response } from 'express';
import prisma from '../config/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { aiLimiter, browseLimiter } from '../middleware/rateLimiter';

const router = Router();

// GET /api/rankings
router.get('/', authenticate, browseLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { sport, tournamentId, category, region, page = '1', limit = '50' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {};
    if (sport) where.sport = sport;
    if (tournamentId) where.tournamentId = tournamentId;
    if (category) where.category = category;
    if (region) where.region = region;

    const [rankings, total] = await Promise.all([
      prisma.playerRanking.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, avatar: true, position: true, location: true } },
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

// POST /api/rankings/calculate/:tournamentId — trigger ranking calculation (admin)
router.post('/calculate/:tournamentId', authenticate, requireRole('ADMIN'), aiLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const tournamentId = req.params.tournamentId as string;
    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) {
      res.status(404).json({ error: 'Tournament not found' });
      return;
    }

    // Delete old rankings for this tournament
    await prisma.playerRanking.deleteMany({ where: { tournamentId } });

    let playerScores: { userId: string; score: number }[] = [];

    if (tournament.sport === 'BASKETBALL') {
      const stats = await prisma.basketballStats.findMany({
        where: { tournamentId },
      });
      const aggregated = new Map<string, { total: number; games: number }>();
      for (const s of stats) {
        const existing = aggregated.get(s.userId) || { total: 0, games: 0 };
        const score =
          s.points * 0.25 + s.rebounds * 0.15 + s.assists * 0.20 +
          s.steals * 0.10 + s.blocks * 0.10 +
          ((s.points + s.rebounds + s.assists + s.steals + s.blocks - s.turnovers) * 0.20);
        existing.total += score;
        existing.games += 1;
        aggregated.set(s.userId, existing);
      }
      playerScores = Array.from(aggregated.entries()).map(([userId, data]) => ({
        userId,
        score: data.total / data.games,
      }));
    } else if (tournament.sport === 'FOOTBALL') {
      const stats = await prisma.footballStats.findMany({
        where: { tournamentId },
      });
      const aggregated = new Map<string, { total: number; games: number }>();
      for (const s of stats) {
        const existing = aggregated.get(s.userId) || { total: 0, games: 0 };
        const score =
          s.goals * 0.30 + s.assists * 0.20 + s.passes * 0.005 * 0.15 +
          s.tackles * 0.15 + s.saves * 0.20;
        existing.total += score;
        existing.games += 1;
        aggregated.set(s.userId, existing);
      }
      playerScores = Array.from(aggregated.entries()).map(([userId, data]) => ({
        userId,
        score: data.total / data.games,
      }));
    } else if (tournament.sport === 'CRICKET') {
      const stats = await prisma.cricketStats.findMany({
        where: { tournamentId },
      });
      const aggregated = new Map<string, { total: number; games: number }>();
      for (const s of stats) {
        const existing = aggregated.get(s.userId) || { total: 0, games: 0 };
        const score =
          s.runs * 0.25 + s.wickets * 5 * 0.25 +
          (s.strikeRate > 0 ? s.strikeRate * 0.01 * 0.15 : 0) +
          (s.economy > 0 ? (12 - s.economy) * 0.15 : 0) +
          s.catches * 2 * 0.10 + s.fours * 0.5 * 0.05 + s.sixes * 1 * 0.05;
        existing.total += score;
        existing.games += 1;
        aggregated.set(s.userId, existing);
      }
      playerScores = Array.from(aggregated.entries()).map(([userId, data]) => ({
        userId,
        score: data.total / data.games,
      }));
    }

    // Sort by score descending and assign ranks
    playerScores.sort((a, b) => b.score - a.score);

    const rankingData = playerScores.map((ps, index) => ({
      userId: ps.userId,
      tournamentId,
      sport: tournament.sport,
      rank: index + 1,
      score: Math.round(ps.score * 100) / 100,
      category: 'OVERALL',
    }));

    if (rankingData.length > 0) {
      await prisma.playerRanking.createMany({ data: rankingData });
    }

    res.json({ message: 'Rankings calculated', count: rankingData.length });
  } catch (error) {
    console.error('Calculate rankings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
