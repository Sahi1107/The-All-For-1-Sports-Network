import { Router, Response } from 'express';
import prisma from '../config/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { uploadVideo } from '../middleware/upload';
import { browseLimiter, uploadLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import { validateVideoBytes } from '../middleware/upload';
import { CreateHighlightBody, HighlightListQuery } from '../validation/post';
import { uploadToGCS, signMediaDeep, signMediaDeepAll } from '../services/storage';

const router = Router();

// POST /api/highlights — upload highlight video
router.post('/', authenticate, uploadLimiter, uploadVideo.single('video'), validate({ body: CreateHighlightBody }), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'Video file is required' });
      return;
    }
    if (!validateVideoBytes(req.file, res)) return;

    const { title, description, tournamentId, tournamentLocation } = req.body;
    // Use the authenticated user's sport
    const uploader = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { sport: true },
    });
    const sport = uploader?.sport;

    // Upload video to GCS, store the bare object key.
    const ext = (req.file.mimetype.split('/')[1] || 'mp4').replace(/[^a-z0-9]/gi, '');
    const videoKey = await uploadToGCS(req.file.buffer, 'highlights', ext, req.file.mimetype);

    const highlight = await prisma.highlight.create({
      data: {
        userId: req.user!.userId,
        title,
        description: description || null,
        videoUrl: videoKey,
        // GCS does not auto-generate thumbnails like Cloudinary did. Leave null
        // for new uploads; the frontend already handles missing thumbnails by
        // showing the video's first frame.
        thumbnailUrl: null,
        sport: sport as any,
        tournamentId: tournamentId || null,
        tournamentLocation: tournamentLocation || null,
      },
      include: { user: { select: { id: true, name: true, avatar: true, role: true, sport: true } } },
    });

    await signMediaDeep(highlight);
    res.status(201).json({ highlight });
  } catch (error) {
    console.error('Upload highlight error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/highlights — list highlights
router.get('/', authenticate, browseLimiter, validate({ query: HighlightListQuery }), async (req: AuthRequest, res: Response) => {
  try {
    const { sport, userId, tournamentId, page = '1', limit = '20' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {};
    if (sport) where.sport = sport;
    if (userId) where.userId = userId;
    if (tournamentId) where.tournamentId = tournamentId;

    const [highlights, total] = await Promise.all([
      prisma.highlight.findMany({
        where,
        include: { user: { select: { id: true, name: true, avatar: true, role: true, sport: true } } },
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.highlight.count({ where }),
    ]);

    await signMediaDeepAll(highlights);
    res.json({ highlights, total, page: parseInt(page as string), totalPages: Math.ceil(total / parseInt(limit as string)) });
  } catch (error) {
    console.error('Get highlights error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/highlights/user/:userId — list highlights for a specific user
router.get('/user/:userId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const highlights = await prisma.highlight.findMany({
      where: { userId: req.params.userId as string },
      orderBy: { createdAt: 'desc' },
    });
    await signMediaDeepAll(highlights);
    res.json({ highlights });
  } catch (error) {
    console.error('Get user highlights error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/highlights/:id
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const highlight = await prisma.highlight.findUnique({
      where: { id: req.params.id as string },
      include: {
        user: { select: { id: true, name: true, avatar: true, role: true, sport: true } },
        tournament: { select: { id: true, name: true } },
      },
    });
    if (!highlight) {
      res.status(404).json({ error: 'Highlight not found' });
      return;
    }

    // Increment views
    await prisma.highlight.update({ where: { id: req.params.id as string }, data: { views: { increment: 1 } } });

    const result = { ...highlight, views: highlight.views + 1 };
    await signMediaDeep(result);
    res.json({ highlight: result });
  } catch (error) {
    console.error('Get highlight error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/highlights/:id
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const highlight = await prisma.highlight.findUnique({ where: { id: req.params.id as string } });
    if (!highlight || highlight.userId !== req.user!.userId) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }
    await prisma.highlight.delete({ where: { id: req.params.id as string } });
    res.json({ message: 'Highlight deleted' });
  } catch (error) {
    console.error('Delete highlight error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
