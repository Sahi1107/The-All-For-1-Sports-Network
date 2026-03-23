import { Router, Response } from 'express';
import prisma from '../config/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { browseLimiter } from '../middleware/rateLimiter';

const router = Router();

// GET /api/feed — personalized feed
router.get('/', authenticate, browseLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { page = '1', limit = '20' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Get IDs of users the current user follows
    const followingList = await prisma.follow.findMany({
      where: { followerId: req.user!.userId },
      select: { followingId: true },
    });
    const followingIds = followingList.map((f: any) => f.followingId);

    // Feed: highlights from followed users + same sport (excluding own)
    const where: any = {
      OR: [
        { userId: { in: followingIds } },
        { sport: user.sport },
      ],
      userId: { not: req.user!.userId },
    };

    const [highlights, total] = await Promise.all([
      prisma.highlight.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, avatar: true, role: true, sport: true, position: true } },
          tournament: { select: { id: true, name: true } },
        },
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.highlight.count({ where }),
    ]);

    res.json({ highlights, total, page: parseInt(page as string), totalPages: Math.ceil(total / parseInt(limit as string)) });
  } catch (error) {
    console.error('Feed error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
