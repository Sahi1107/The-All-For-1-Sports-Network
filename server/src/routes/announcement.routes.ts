import { Router, Response } from 'express';
import prisma from '../config/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { browseLimiter, writeLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import { CreateAnnouncementBody, AnnouncementListQuery } from '../validation/announcement';

const router = Router();

// POST /api/announcements — create (coach/scout/agent only)
router.post('/', authenticate, requireRole('COACH', 'SCOUT', 'AGENT', 'ADMIN'), writeLimiter, validate({ body: CreateAnnouncementBody }), async (req: AuthRequest, res: Response) => {
  try {
    const { title, content, type, sport } = req.body;
    if (!title || !content) {
      res.status(400).json({ error: 'Title and content are required' });
      return;
    }

    const announcement = await prisma.announcement.create({
      data: {
        userId: req.user!.userId,
        title,
        content,
        ...(type && { type }),
        ...(sport && { sport }),
      },
      include: { user: { select: { id: true, name: true, avatar: true, role: true } } },
    });

    res.status(201).json({ announcement });
  } catch (error) {
    console.error('Create announcement error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/announcements
router.get('/', authenticate, browseLimiter, validate({ query: AnnouncementListQuery }), async (req: AuthRequest, res: Response) => {
  try {
    const { sport, type, page = '1', limit = '20' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {};
    if (sport) where.sport = sport;
    if (type) where.type = type;

    const [announcements, total] = await Promise.all([
      prisma.announcement.findMany({
        where,
        include: { user: { select: { id: true, name: true, avatar: true, role: true } } },
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.announcement.count({ where }),
    ]);

    res.json({ announcements, total, page: parseInt(page as string), totalPages: Math.ceil(total / parseInt(limit as string)) });
  } catch (error) {
    console.error('Get announcements error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/announcements/:id
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const announcement = await prisma.announcement.findUnique({ where: { id: req.params.id as string } });
    const isAdmin = req.user!.role === 'ADMIN';
    if (!announcement || (announcement.userId !== req.user!.userId && !isAdmin)) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }
    await prisma.announcement.delete({ where: { id: req.params.id as string } });
    res.json({ message: 'Announcement deleted' });
  } catch (error) {
    console.error('Delete announcement error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
