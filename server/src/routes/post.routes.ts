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

function uploadToCloudinary(buffer: Buffer, resourceType: 'image' | 'video'): Promise<any> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: resourceType, folder: 'allfor1/posts' },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    stream.end(buffer);
  });
}

// POST /api/posts
router.post('/', authenticate, uploadLimiter, upload.array('media', 10), validate({ body: CreatePostBody }), async (req: AuthRequest, res: Response) => {
  try {
    const { type, content, title } = req.body;
    const files = (req.files as Express.Multer.File[]) || [];

    // Magic-byte validation for uploaded media
    for (const file of files) {
      if (type === 'IMAGE'     && !validateImageBytes(file, res)) return;
      if (type === 'HIGHLIGHT' && !validateVideoBytes(file, res)) return;
    }

    const uploader = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { sport: true },
    });

    // Upload all files to Cloudinary in parallel
    const mediaUrls: string[] = [];
    if ((type === 'IMAGE' || type === 'HIGHLIGHT') && files.length > 0) {
      const resourceType = type === 'HIGHLIGHT' ? 'video' : 'image';
      const results = await Promise.all(
        files.map((file) => uploadToCloudinary(file.buffer, resourceType))
      );
      mediaUrls.push(...results.map((r) => r.secure_url));
    }

    if (type === 'TEXT' && !content) {
      res.status(400).json({ error: 'Content is required for text posts' });
      return;
    }
    if (type === 'IMAGE' && mediaUrls.length === 0) {
      res.status(400).json({ error: 'At least one image file is required' });
      return;
    }
    if (type === 'HIGHLIGHT' && mediaUrls.length === 0) {
      res.status(400).json({ error: 'Video file is required' });
      return;
    }

    const post = await prisma.post.create({
      data: {
        userId: req.user!.userId,
        type: type as any,
        content: content || null,
        title: title || null,
        mediaUrl: mediaUrls[0] || null,
        sport: uploader?.sport as any,
        media: mediaUrls.length > 0 ? {
          create: mediaUrls.map((url, i) => ({ url, position: i })),
        } : undefined,
      },
      include: {
        user: { select: { id: true, name: true, avatar: true, role: true, sport: true } },
        media: { orderBy: { position: 'asc' } },
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
      include: {
        user: { select: { id: true, name: true, avatar: true } },
        media: { orderBy: { position: 'asc' } },
      },
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
