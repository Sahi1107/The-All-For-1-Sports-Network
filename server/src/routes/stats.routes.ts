import { Router, Request, Response } from 'express';
import prisma from '../config/db';
import { browseLimiter } from '../middleware/rateLimiter';

const router = Router();

// GET /api/stats/athletes — public count of athlete profiles, optionally by sport.
// Unauthenticated: powers the "X entered" figure on the public Challenges page.
router.get('/athletes', browseLimiter, async (req: Request, res: Response) => {
  try {
    const { sport } = req.query;

    const where: any = { role: 'ATHLETE' };
    if (sport) where.sport = sport;

    const count = await prisma.user.count({ where });

    res.json({ count });
  } catch (error) {
    console.error('Get athlete count error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
