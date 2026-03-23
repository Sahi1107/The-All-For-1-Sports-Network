import { Router, Response } from 'express';
import multer from 'multer';
import prisma from '../config/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import cloudinary from '../config/cloudinary';
import { uploadLimiter, writeLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import { validateImageBytes, validateVideoBytes } from '../middleware/upload';
import { CreatePostBody } from '../validation/post';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

// POST /api/posts
router.post('/', authenticate, uploadLimiter, upload.single('media'), validate({ body: CreatePostBody }), async (req: AuthRequest, res: Response) => {
  try {
    const { type, content, title } = req.body;

    // Magic-byte validation for uploaded media
    if (req.file) {
      if (type === 'IMAGE'     && !validateImageBytes(req.file, res)) return;
      if (type === 'HIGHLIGHT' && !validateVideoBytes(req.file, res)) return;
    }

    const uploader = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { sport: true },
    });

    let mediaUrl: string | undefined;
    if ((type === 'IMAGE' || type === 'HIGHLIGHT') && req.file) {
      const resourceType = type === 'HIGHLIGHT' ? 'video' : 'image';
      const uploadResult = await new Promise<any>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { resource_type: resourceType, folder: 'allfor1/posts' },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        stream.end(req.file!.buffer);
      });
      mediaUrl = uploadResult.secure_url;
    }

    if (type === 'TEXT' && !content) {
      res.status(400).json({ error: 'Content is required for text posts' });
      return;
    }
    if (type === 'IMAGE' && !mediaUrl) {
      res.status(400).json({ error: 'Image file is required' });
      return;
    }
    if (type === 'HIGHLIGHT' && !mediaUrl) {
      res.status(400).json({ error: 'Video file is required' });
      return;
    }

    const post = await prisma.post.create({
      data: {
        userId: req.user!.userId,
        type: type as any,
        content: content || null,
        title: title || null,
        mediaUrl: mediaUrl || null,
        sport: uploader?.sport as any,
      },
      include: {
        user: { select: { id: true, name: true, avatar: true, role: true, sport: true } },
      },
    });

    res.status(201).json({ post });
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/posts/user/:userId
router.get('/user/:userId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const posts = await prisma.post.findMany({
      where: { userId: req.params.userId as string },
      include: { user: { select: { id: true, name: true, avatar: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ posts });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/posts/:id
router.delete('/:id', authenticate, writeLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const post = await prisma.post.findUnique({ where: { id: req.params.id as string } });
    if (!post || post.userId !== req.user!.userId) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }
    await prisma.post.delete({ where: { id: req.params.id as string } });
    res.json({ message: 'Post deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
