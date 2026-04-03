import { Router, Response } from 'express';
import prisma from '../config/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { browseLimiter } from '../middleware/rateLimiter';

const router = Router();

// GET /api/feed — unified feed: posts + highlights, including own content
router.get('/', authenticate, browseLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { page = '1', limit = '20' } = req.query;
    const take = parseInt(limit as string);
    const skip = (parseInt(page as string) - 1) * take;

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

    // Include own content + followed users + same sport
    const userFilter = {
      OR: [
        { userId: req.user!.userId },
        { userId: { in: followingIds } },
        { sport: user.sport },
      ],
    };

    // Fetch posts and highlights in parallel
    const [posts, postCount, highlights, highlightCount] = await Promise.all([
      prisma.post.findMany({
        where: userFilter,
        include: {
          user: { select: { id: true, name: true, avatar: true, role: true, sport: true, position: true } },
          media: { orderBy: { position: 'asc' } },
          _count: { select: { likes: true, comments: true } },
          likes: { where: { userId: req.user!.userId }, select: { id: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.post.count({ where: userFilter }),
      prisma.highlight.findMany({
        where: userFilter,
        include: {
          user: { select: { id: true, name: true, avatar: true, role: true, sport: true, position: true } },
          tournament: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.highlight.count({ where: userFilter }),
    ]);

    // Normalize into a unified feed sorted by createdAt desc
    const feed = [
      ...posts.map((p) => ({
        id: p.id,
        kind: 'post' as const,
        type: p.type,
        content: p.content,
        title: p.title,
        mediaUrl: p.mediaUrl,
        media: p.media,
        sport: p.sport,
        user: p.user,
        createdAt: p.createdAt,
        likeCount: p._count.likes,
        commentCount: p._count.comments,
        likedByMe: p.likes.length > 0,
      })),
      ...highlights.map((h) => ({
        id: h.id,
        kind: 'highlight' as const,
        type: 'HIGHLIGHT' as const,
        title: h.title,
        description: h.description,
        videoUrl: h.videoUrl,
        thumbnailUrl: h.thumbnailUrl,
        views: h.views,
        sport: h.sport,
        user: h.user,
        tournament: h.tournament,
        createdAt: h.createdAt,
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
     .slice(0, take);

    const total = postCount + highlightCount;

    res.json({
      feed,
      total,
      page: parseInt(page as string),
      totalPages: Math.ceil(total / take),
    });
  } catch (error) {
    console.error('Feed error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
