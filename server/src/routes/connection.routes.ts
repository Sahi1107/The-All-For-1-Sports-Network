import { Router, Response } from 'express';
import prisma from '../config/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { socialLimiter } from '../middleware/rateLimiter';

const router = Router();

// POST /api/connections/follow/:userId
router.post('/follow/:userId', authenticate, socialLimiter, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user!.userId === req.params.userId as string) {
      res.status(400).json({ error: 'Cannot follow yourself' });
      return;
    }

    const follow = await prisma.follow.create({
      data: { followerId: req.user!.userId, followingId: req.params.userId as string },
    });

    // Create notification — include actor name
    const follower = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { name: true } });
    await prisma.notification.create({
      data: {
        userId: req.params.userId as string,
        type: 'FOLLOW',
        title: 'New Follower',
        message: `${follower?.name ?? 'Someone'} started following you`,
        referenceId: req.user!.userId,
      },
    });

    res.status(201).json({ follow });
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(409).json({ error: 'Already following this user' });
      return;
    }
    console.error('Follow error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/connections/unfollow/:userId
router.delete('/unfollow/:userId', authenticate, socialLimiter, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.follow.delete({
      where: { followerId_followingId: { followerId: req.user!.userId, followingId: req.params.userId as string } },
    });
    res.json({ message: 'Unfollowed' });
  } catch (error) {
    console.error('Unfollow error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/connections/request/:userId — send connection request
router.post('/request/:userId', authenticate, socialLimiter, async (req: AuthRequest, res: Response) => {
  try {
    if (req.user!.userId === req.params.userId as string) {
      res.status(400).json({ error: 'Cannot connect with yourself' });
      return;
    }

    const connection = await prisma.connection.create({
      data: { senderId: req.user!.userId, receiverId: req.params.userId as string },
    });

    const requester = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { name: true } });
    await prisma.notification.create({
      data: {
        userId: req.params.userId as string,
        type: 'CONNECTION_REQUEST',
        title: 'Connection Request',
        message: `${requester?.name ?? 'Someone'} sent you a connection request`,
        referenceId: req.user!.userId,
      },
    });

    res.status(201).json({ connection });
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(409).json({ error: 'Connection request already exists' });
      return;
    }
    console.error('Connection request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/connections/:id/accept
router.put('/:id/accept', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const connection = await prisma.connection.update({
      where: { id: req.params.id as string, receiverId: req.user!.userId },
      data: { status: 'ACCEPTED' },
    });

    const acceptor = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { name: true } });
    await prisma.notification.create({
      data: {
        userId: connection.senderId,
        type: 'CONNECTION_ACCEPTED',
        title: 'Connection Accepted',
        message: `${acceptor?.name ?? 'Someone'} accepted your connection request`,
        referenceId: req.user!.userId,
      },
    });

    res.json({ connection });
  } catch (error) {
    console.error('Accept connection error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/connections/:id/reject
router.put('/:id/reject', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const connection = await prisma.connection.update({
      where: { id: req.params.id as string, receiverId: req.user!.userId },
      data: { status: 'REJECTED' },
    });
    res.json({ connection });
  } catch (error) {
    console.error('Reject connection error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/connections/followers
router.get('/followers', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const followers = await prisma.follow.findMany({
      where: { followingId: req.user!.userId },
      include: { follower: { select: { id: true, name: true, avatar: true, role: true, sport: true, position: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ followers: followers.map((f: any) => f.follower) });
  } catch (error) {
    console.error('Get followers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/connections/following
router.get('/following', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const following = await prisma.follow.findMany({
      where: { followerId: req.user!.userId },
      include: { following: { select: { id: true, name: true, avatar: true, role: true, sport: true, position: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ following: following.map((f: any) => f.following) });
  } catch (error) {
    console.error('Get following error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/connections/requests — pending incoming requests
router.get('/requests', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const requests = await prisma.connection.findMany({
      where: { receiverId: req.user!.userId, status: 'PENDING' },
      include: { sender: { select: { id: true, name: true, avatar: true, role: true, sport: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ requests });
  } catch (error) {
    console.error('Get requests error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/connections/suggestions — people in similar field the user doesn't follow yet
router.get('/suggestions', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { sport: true, role: true } });
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    // IDs the user already follows
    const following = await prisma.follow.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    });
    const excludeIds = [userId, ...following.map((f: any) => f.followingId)];

    // Same sport first, then others — limit 20
    const suggestions = await prisma.user.findMany({
      where: { id: { notIn: excludeIds } },
      select: { id: true, name: true, avatar: true, role: true, sport: true, position: true, location: true },
      orderBy: [{ sport: 'asc' }],
      take: 20,
    });

    // Sort: same sport first
    suggestions.sort((a: any, b: any) => {
      const aMatch = a.sport === user.sport ? 0 : 1;
      const bMatch = b.sport === user.sport ? 0 : 1;
      return aMatch - bMatch;
    });

    res.json({ suggestions });
  } catch (error) {
    console.error('Suggestions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
