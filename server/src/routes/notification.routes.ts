import { Router, Response } from 'express';
import prisma from '../config/db';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// Notifications live for 56 days, then they're dropped from view and pruned.
const NOTIFICATION_TTL_DAYS = 56;

// GET /api/notifications
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { page = '1', limit = '30' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const cutoff = new Date(Date.now() - NOTIFICATION_TTL_DAYS * 24 * 60 * 60 * 1000);

    // Best-effort prune of expired notifications for this user; don't block on it
    prisma.notification
      .deleteMany({ where: { userId: req.user!.userId, createdAt: { lt: cutoff } } })
      .catch((err) => console.error('Prune old notifications failed:', err));

    const baseWhere = { userId: req.user!.userId, createdAt: { gte: cutoff } };

    const [rawNotifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: baseWhere,
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where: baseWhere }),
      prisma.notification.count({ where: { ...baseWhere, read: false } }),
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

// PATCH /api/notifications/:id/read
router.patch('/:id/read', authenticate, async (req: AuthRequest, res: Response) => {
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

// PATCH /api/notifications/read-all
router.patch('/read-all', authenticate, async (req: AuthRequest, res: Response) => {
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
