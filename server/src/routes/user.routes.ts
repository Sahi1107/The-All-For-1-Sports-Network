import { Router, Response } from 'express';
import prisma from '../config/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { uploadImage, validateImageBytes } from '../middleware/upload';
import cloudinary from '../config/cloudinary';
import { Readable } from 'stream';
import { browseLimiter, writeLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import { UpdateProfileBody, UserSearchQuery } from '../validation/user';

const router = Router();

// GET /api/users — search/filter users
router.get('/', authenticate, browseLimiter, validate({ query: UserSearchQuery }), async (req: AuthRequest, res: Response) => {
  try {
    const { role, sport, search, location, page = '1', limit = '20' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {};
    // Never expose ADMIN accounts to other users
    if (role && role !== 'ADMIN') where.role = role;
    else where.role = { not: 'ADMIN' };
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

    res.json({ users, total, page: parseInt(page as string), totalPages: Math.ceil(total / parseInt(limit as string)) });
  } catch (error) {
    console.error('Get users error:', error);
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
        // Email is private — only returned when viewing your own profile
        ...(isSelf && { email: true }),
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

    // Check if current user follows/is connected to this user
    const [isFollowing, connection] = await Promise.all([
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
    ]);

    res.json({ user, isFollowing: !!isFollowing, connection });
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
    res.json({ users: follows.map((f) => f.follower) });
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
    res.json({ users: follows.map((f) => f.following) });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper: upload buffer to Cloudinary
function uploadToCloudinary(buffer: Buffer, folder: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image', transformation: [{ width: 400, height: 400, crop: 'fill' }] },
      (err, result) => {
        if (err || !result) return reject(err ?? new Error('Upload failed'));
        resolve(result.secure_url);
      }
    );
    Readable.from(buffer).pipe(stream);
  });
}

// PUT /api/users/profile — update own profile
router.put('/profile', authenticate, writeLimiter, uploadImage.single('avatar'), validate({ body: UpdateProfileBody }), async (req: AuthRequest, res: Response) => {
  try {
    const { name, bio, location, age, height, position, achievements } = req.body;

    let avatarUrl: string | undefined;
    if (req.file) {
      if (!validateImageBytes(req.file, res)) return;
      avatarUrl = await uploadToCloudinary(req.file.buffer, 'allfor1/avatars');
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
        ...(avatarUrl !== undefined && { avatar: avatarUrl }),
      },
      select: {
        id: true, email: true, name: true, role: true, sport: true, avatar: true,
        bio: true, location: true, age: true, height: true, position: true,
        achievements: true, verified: true, createdAt: true,
      },
    });

    res.json({ user });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
