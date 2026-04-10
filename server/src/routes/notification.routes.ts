import { Router, Response } from 'express';
import prisma from '../config/db';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/notifications
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { page = '1', limit = '30' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [rawNotifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.user!.userId },
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where: { userId: req.user!.userId } }),
      prisma.notification.count({ where: { userId: req.user!.userId, read: false } }),
    ]);

    // Resolve referenceId → actor user for FOLLOW / CONNECTION_* notifications
    const actorIds = [...new Set(
      rawNotifications
        .filter((n: any) => n.referenceId && ['FOLLOW', 'CONNECTION_REQUEST', 'CONNECTION_ACCEPTED'].includes(n.type))
        .map((n: any) => n.referenceId),
    )] as string[];

    const actors = actorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true, avatar: true, role: true, sport: true },
        })
      : [];
    const actorMap = Object.fromEntries(actors.map((a: any) => [a.id, a]));

    const notifications = rawNotifications.map((n: any) => ({
      ...n,
      actor: n.referenceId ? actorMap[n.referenceId] ?? null : null,
    }));

    res.json({ notifications, total, unreadCount, page: parseInt(page as string) });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.notification.update({
      where: { id: req.params.id as string, userId: req.user!.userId },
      data: { read: true },
    });
    res.json({ message: 'Marked as read' });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/notifications/read-all
router.put('/read-all', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.userId, read: false },
      data: { read: true },
    });
    res.json({ message: 'All marked as read' });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
