import { Router, Response } from 'express';
import prisma from '../config/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { uploadImage, validateImageBytes } from '../middleware/upload';
import { browseLimiter, writeLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import { UpdateProfileBody, UserSearchQuery } from '../validation/user';
import { uploadToGCS, signMediaDeep, signMediaDeepAll } from '../services/storage';

const router = Router();

// IDs that should be hidden from the current user: anyone they blocked OR
// anyone who blocked them. Used to filter Explore, suggestions, etc.
async function hiddenUserIds(userId: string): Promise<string[]> {
  const [mine, theirs] = await Promise.all([
    prisma.block.findMany({ where: { blockerId: userId }, select: { blockedId: true } }),
    prisma.block.findMany({ where: { blockedId: userId }, select: { blockerId: true } }),
  ]);
  return [...new Set([...mine.map((b) => b.blockedId), ...theirs.map((b) => b.blockerId)])];
}

// GET /api/users — search/filter users
router.get('/', authenticate, browseLimiter, validate({ query: UserSearchQuery }), async (req: AuthRequest, res: Response) => {
  try {
    const { role, sport, search, location, page = '1', limit = '20' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {};
    // Never expose ADMIN accounts to other users
    if (role && role !== 'ADMIN') where.role = role;
    else where.role = { not: 'ADMIN' };
    // Don't show the current user OR anyone in a block relationship with them
    const blocked = await hiddenUserIds(req.user!.userId);
    where.id = { notIn: [req.user!.userId, ...blocked] };
    if (sport) where.sport = sport;
    if (location) where.location = { contains: location as string, mode: 'insensitive' };
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { bio: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, name: true, role: true, sport: true, avatar: true,
          bio: true, location: true, position: true, verified: true,
          _count: { select: { followers: true, following: true, highlights: true } },
        },
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    await signMediaDeepAll(users);
    res.json({ users, total, page: parseInt(page as string), totalPages: Math.ceil(total / parseInt(limit as string)) });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/blocked — users the current user has blocked
router.get('/blocked', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const blocks = await prisma.block.findMany({
      where: { blockerId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
      include: { blocked: { select: { id: true, name: true, avatar: true, role: true, sport: true } } },
    });
    const users = blocks.map((b) => b.blocked);
    await signMediaDeepAll(users);
    res.json({ users });
  } catch (error) {
    console.error('Get blocked error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users/block/:id — block another user
router.post('/block/:id', authenticate, writeLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const target = req.params.id as string;
    if (target === req.user!.userId) {
      res.status(400).json({ error: 'Cannot block yourself' });
      return;
    }
    await prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId: req.user!.userId, blockedId: target } },
      create: { blockerId: req.user!.userId, blockedId: target },
      update: {},
    });
    // Remove any follow/connection relationships in either direction
    await prisma.follow.deleteMany({
      where: {
        OR: [
          { followerId: req.user!.userId, followingId: target },
          { followerId: target, followingId: req.user!.userId },
        ],
      },
    });
    await prisma.connection.deleteMany({
      where: {
        OR: [
          { senderId: req.user!.userId, receiverId: target },
          { senderId: target, receiverId: req.user!.userId },
        ],
      },
    });
    res.json({ blocked: true });
  } catch (error) {
    console.error('Block error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/users/block/:id — unblock
router.delete('/block/:id', authenticate, writeLimiter, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.block.deleteMany({
      where: { blockerId: req.user!.userId, blockedId: req.params.id as string },
    });
    res.json({ blocked: false });
  } catch (error) {
    console.error('Unblock error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users/report/:id — report another user
router.post('/report/:id', authenticate, writeLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const target = req.params.id as string;
    if (target === req.user!.userId) {
      res.status(400).json({ error: 'Cannot report yourself' });
      return;
    }
    const reason = String(req.body.reason ?? '').trim();
    const details = req.body.details ? String(req.body.details).trim().slice(0, 1000) : null;
    if (!reason || reason.length > 100) {
      res.status(400).json({ error: 'Reason is required (max 100 chars)' });
      return;
    }
    await prisma.report.create({
      data: {
        reporterId: req.user!.userId,
        reportedUserId: target,
        reason,
        details,
      },
    });
    res.status(201).json({ reported: true });
  } catch (error) {
    console.error('Report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/users/settings/notifications — update notification preferences
router.patch('/settings/notifications', authenticate, writeLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { messageNotifications } = req.body ?? {};
    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        ...(typeof messageNotifications === 'boolean' && { messageNotifications }),
      },
      select: { messageNotifications: true },
    });
    res.json({ settings: user });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:id — get user profile
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const isSelf = req.user!.userId === req.params.id as string;

    const user = await prisma.user.findUnique({
      where: { id: req.params.id as string },
      select: {
        id: true, name: true, role: true, sport: true, avatar: true,
        bio: true, location: true, age: true, height: true, position: true,
        achievements: true, verified: true, createdAt: true,
        contactEmail: true, banner: true,
        // Email, phone, and notification settings are private
        ...(isSelf && { email: true, phone: true, messageNotifications: true }),
        highlights: { orderBy: { createdAt: 'desc' }, take: 10 },
        teamMemberships: { include: { team: true } },
        playerRankings: { orderBy: { calculatedAt: 'desc' }, take: 5, include: { tournament: { select: { id: true, name: true } } } },
        _count: { select: { followers: true, following: true, highlights: true } },
      },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Check if current user follows/is connected to / has blocked this user
    const [isFollowing, connection, blockRow] = await Promise.all([
      prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: req.user!.userId, followingId: req.params.id as string } },
      }),
      prisma.connection.findFirst({
        where: {
          OR: [
            { senderId: req.user!.userId, receiverId: req.params.id as string },
            { senderId: req.params.id as string, receiverId: req.user!.userId },
          ],
        },
      }),
      isSelf ? Promise.resolve(null) : prisma.block.findUnique({
        where: { blockerId_blockedId: { blockerId: req.user!.userId, blockedId: req.params.id as string } },
      }),
    ]);

    await signMediaDeep(user);
    res.json({ user, isFollowing: !!isFollowing, connection, isBlocked: !!blockRow });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:id/followers
router.get('/:id/followers', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const follows = await prisma.follow.findMany({
      where: { followingId: req.params.id as string },
      select: {
        follower: {
          select: { id: true, name: true, avatar: true, role: true, sport: true, position: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const usersOut = follows.map((f) => f.follower);
    await signMediaDeepAll(usersOut);
    res.json({ users: usersOut });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/:id/following
router.get('/:id/following', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const follows = await prisma.follow.findMany({
      where: { followerId: req.params.id as string },
      select: {
        following: {
          select: { id: true, name: true, avatar: true, role: true, sport: true, position: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const usersOut = follows.map((f) => f.following);
    await signMediaDeepAll(usersOut);
    res.json({ users: usersOut });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper: upload an avatar buffer to GCS and return its object key.
// Note: GCS does not perform server-side image transforms; the previous
// 400x400 fill was a Cloudinary feature. The frontend already crops avatars
// at display time, so we store the original.
async function uploadAvatar(file: Express.Multer.File): Promise<string> {
  const ext = (file.mimetype.split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '');
  return uploadToGCS(file.buffer, 'avatars', ext, file.mimetype);
}

// PUT /api/users/profile — update own profile
router.put('/profile', authenticate, writeLimiter, uploadImage.single('avatar'), validate({ body: UpdateProfileBody }), async (req: AuthRequest, res: Response) => {
  try {
    const { name, bio, location, age, height, position, achievements, phone, contactEmail } = req.body;

    let avatarUrl: string | undefined;
    if (req.file) {
      if (!validateImageBytes(req.file, res)) return;
      avatarUrl = await uploadAvatar(req.file);
    }

    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        ...(name !== undefined && { name }),
        ...(bio !== undefined && { bio }),
        ...(location !== undefined && { location }),
        ...(age !== undefined && { age: parseInt(age) }),
        ...(height !== undefined && { height }),
        ...(position !== undefined && { position }),
        ...(achievements !== undefined && { achievements }),
        ...(phone !== undefined && { phone }),
        ...(contactEmail !== undefined && { contactEmail }),
        ...(avatarUrl !== undefined && { avatar: avatarUrl }),
      },
      select: {
        id: true, email: true, name: true, role: true, sport: true, avatar: true,
        bio: true, location: true, age: true, height: true, position: true,
        achievements: true, verified: true, createdAt: true,
        phone: true, contactEmail: true, banner: true,
      },
    });

    await signMediaDeep(user);
    res.json({ user });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/users/profile/banner — upload/replace banner image
router.put('/profile/banner', authenticate, writeLimiter, uploadImage.single('banner'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Banner image is required' });
      return;
    }
    if (!validateImageBytes(req.file, res)) return;
    const ext = (req.file.mimetype.split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '');
    const key = await uploadToGCS(req.file.buffer, 'banners', ext, req.file.mimetype);
    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { banner: key },
      select: { banner: true },
    });
    await signMediaDeep(user);
    res.json({ banner: user.banner });
  } catch (error) {
    console.error('Upload banner error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
