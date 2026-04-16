import { Router, Response } from 'express';
import multer from 'multer';
import prisma from '../config/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { uploadLimiter, writeLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import { validateImageBytes, validateVideoBytes } from '../middleware/upload';
import { CreatePostBody } from '../validation/post';
import { uploadToGCS, signMediaDeep, signMediaDeepAll } from '../services/storage';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

// Derive a sane file extension from a multer file (mimetype is the source of truth).
function extFromFile(file: Express.Multer.File): string {
  const fromMime = file.mimetype.split('/')[1] || 'bin';
  // image/jpeg -> jpg
  return fromMime === 'jpeg' ? 'jpg' : fromMime.replace(/[^a-z0-9]/gi, '');
}

// POST /api/posts
router.post('/', authenticate, uploadLimiter, upload.array('media', 10), validate({ body: CreatePostBody }), async (req: AuthRequest, res: Response) => {
  try {
    const { type, content, title, commentsDisabled } = req.body;
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

    // Upload all files to GCS in parallel; we store bare object keys.
    const mediaUrls: string[] = [];
    if ((type === 'IMAGE' || type === 'HIGHLIGHT') && files.length > 0) {
      const keys = await Promise.all(
        files.map((file) =>
          uploadToGCS(file.buffer, 'posts', extFromFile(file), file.mimetype),
        ),
      );
      mediaUrls.push(...keys);
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
        commentsDisabled: commentsDisabled === true,
        media: mediaUrls.length > 0 ? {
          create: mediaUrls.map((url, i) => ({ url, position: i })),
        } : undefined,
      },
      include: {
        user: { select: { id: true, name: true, avatar: true, role: true, sport: true } },
        media: { orderBy: { position: 'asc' } },
      },
    });

    await signMediaDeep(post);
    res.status(201).json({ post });
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/posts/saved — current user's saved posts
router.get('/saved', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const saves = await prisma.postSave.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        post: {
          include: {
            user: { select: { id: true, name: true, avatar: true, role: true, sport: true, position: true } },
            media: { orderBy: { position: 'asc' } },
            _count: { select: { likes: true, comments: true, reposts: true } },
            likes: { where: { userId }, select: { id: true } },
            reposts: { where: { userId }, select: { id: true } },
            saves: { where: { userId }, select: { id: true } },
          },
        },
      },
    });
    const posts = saves.map((s) => {
      const p = s.post;
      return {
        ...p,
        likeCount: p._count.likes,
        commentCount: p._count.comments,
        repostCount: p._count.reposts,
        likedByMe: p.likes.length > 0,
        repostedByMe: p.reposts.length > 0,
        savedByMe: p.saves.length > 0,
      };
    });
    await signMediaDeepAll(posts);
    res.json({ posts });
  } catch (error) {
    console.error('Saved posts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/posts/user/:userId
router.get('/user/:userId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const posts = await prisma.post.findMany({
      where: { userId: req.params.userId as string },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
        media: { orderBy: { position: 'asc' } },
        _count: { select: { likes: true, comments: true, reposts: true } },
        likes: { where: { userId }, select: { id: true } },
        reposts: { where: { userId }, select: { id: true } },
        saves: { where: { userId }, select: { id: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const shaped = posts.map((p) => ({
      ...p,
      likeCount: p._count.likes,
      commentCount: p._count.comments,
      repostCount: p._count.reposts,
      likedByMe: p.likes.length > 0,
      repostedByMe: p.reposts.length > 0,
      savedByMe: p.saves.length > 0,
    }));
    await signMediaDeepAll(shaped);
    res.json({ posts: shaped });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/posts/user/:userId/reposts — posts reposted by this user
router.get('/user/:userId/reposts', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const reposts = await prisma.postRepost.findMany({
      where: { userId: req.params.userId as string },
      orderBy: { createdAt: 'desc' },
      include: {
        post: {
          include: {
            user: { select: { id: true, name: true, avatar: true, role: true, sport: true, position: true } },
            media: { orderBy: { position: 'asc' } },
            _count: { select: { likes: true, comments: true, reposts: true } },
            likes: { where: { userId }, select: { id: true } },
            reposts: { where: { userId }, select: { id: true } },
            saves: { where: { userId }, select: { id: true } },
          },
        },
      },
    });
    const posts = reposts.map((r) => {
      const p = r.post;
      return {
        ...p,
        repostedAt: r.createdAt,
        likeCount: p._count.likes,
        commentCount: p._count.comments,
        repostCount: p._count.reposts,
        likedByMe: p.likes.length > 0,
        repostedByMe: p.reposts.length > 0,
        savedByMe: p.saves.length > 0,
      };
    });
    await signMediaDeepAll(posts);
    res.json({ posts });
  } catch (error) {
    console.error('User reposts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/posts/:id/like  — toggle like
router.post('/:id/like', authenticate, writeLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const postId = req.params.id as string;
    const userId = req.user!.userId;

    const existing = await prisma.postLike.findUnique({
      where: { postId_userId: { postId, userId } },
    });

    if (existing) {
      await prisma.postLike.delete({ where: { id: existing.id } });
      const likeCount = await prisma.postLike.count({ where: { postId } });
      res.json({ liked: false, likeCount });
      return;
    }

    await prisma.postLike.create({ data: { postId, userId } });
    const likeCount = await prisma.postLike.count({ where: { postId } });

    // Notify post owner (skip self-likes)
    const post = await prisma.post.findUnique({ where: { id: postId }, select: { userId: true } });
    if (post && post.userId !== userId) {
      const liker = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
      await prisma.notification.create({
        data: {
          userId: post.userId,
          type: 'LIKE',
          title: 'New like',
          message: `${liker?.name} liked your post`,
          referenceId: postId,
        },
      });
    }

    res.json({ liked: true, likeCount });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/posts/:id/repost  — toggle repost
router.post('/:id/repost', authenticate, writeLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const postId = req.params.id as string;
    const userId = req.user!.userId;

    const existing = await prisma.postRepost.findUnique({
      where: { postId_userId: { postId, userId } },
    });

    if (existing) {
      await prisma.postRepost.delete({ where: { id: existing.id } });
      const repostCount = await prisma.postRepost.count({ where: { postId } });
      res.json({ reposted: false, repostCount });
      return;
    }

    await prisma.postRepost.create({ data: { postId, userId } });
    const repostCount = await prisma.postRepost.count({ where: { postId } });

    const post = await prisma.post.findUnique({ where: { id: postId }, select: { userId: true } });
    if (post && post.userId !== userId) {
      const reposter = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
      await prisma.notification.create({
        data: {
          userId: post.userId,
          type: 'REPOST',
          title: 'New repost',
          message: `${reposter?.name} reposted your post`,
          referenceId: postId,
        },
      });
    }

    res.json({ reposted: true, repostCount });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/posts/:id/save  — toggle save/bookmark
router.post('/:id/save', authenticate, writeLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const postId = req.params.id as string;
    const userId = req.user!.userId;

    const existing = await prisma.postSave.findUnique({
      where: { postId_userId: { postId, userId } },
    });

    if (existing) {
      await prisma.postSave.delete({ where: { id: existing.id } });
      res.json({ saved: false });
      return;
    }

    await prisma.postSave.create({ data: { postId, userId } });
    res.json({ saved: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/posts/:id/comments
router.get('/:id/comments', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const postId = req.params.id as string;
    const userId = req.user!.userId;
    const { cursor } = req.query;

    const comments = await prisma.postComment.findMany({
      where: { postId, parentId: null },
      include: {
        user: { select: { id: true, name: true, avatar: true, role: true } },
        _count: { select: { likes: true, replies: true } },
        likes: { where: { userId }, select: { id: true } },
        replies: {
          include: {
            user: { select: { id: true, name: true, avatar: true, role: true } },
            _count: { select: { likes: true } },
            likes: { where: { userId }, select: { id: true } },
          },
          orderBy: { createdAt: 'asc' },
          take: 50,
        },
      },
      orderBy: { createdAt: 'asc' },
      take: 20,
      ...(cursor ? { skip: 1, cursor: { id: cursor as string } } : {}),
    });

    const shaped = comments.map((c) => ({
      ...c,
      likeCount: c._count.likes,
      replyCount: c._count.replies,
      likedByMe: c.likes.length > 0,
      replies: c.replies.map((r) => ({
        ...r,
        likeCount: r._count.likes,
        likedByMe: r.likes.length > 0,
      })),
    }));

    const nextCursor = comments.length === 20 ? comments[comments.length - 1].id : null;
    await signMediaDeepAll(shaped);
    res.json({ comments: shaped, nextCursor });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/posts/:id/comments
router.post('/:id/comments', authenticate, writeLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const postId = req.params.id as string;
    const userId = req.user!.userId;
    const content = (req.body.content ?? '').trim();
    const parentId = req.body.parentId ?? null;

    if (!content) {
      res.status(400).json({ error: 'Comment cannot be empty' });
      return;
    }
    if (content.length > 500) {
      res.status(400).json({ error: 'Comment too long (max 500 characters)' });
      return;
    }

    const post = await prisma.post.findUnique({ where: { id: postId }, select: { userId: true, commentsDisabled: true } });
    if (!post) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }
    if (post.commentsDisabled) {
      res.status(403).json({ error: 'Comments are disabled on this post' });
      return;
    }

    // Validate parent comment if replying
    if (parentId) {
      const parent = await prisma.postComment.findUnique({ where: { id: parentId }, select: { postId: true } });
      if (!parent || parent.postId !== postId) {
        res.status(404).json({ error: 'Parent comment not found' });
        return;
      }
    }

    const comment = await prisma.postComment.create({
      data: { postId, userId, content, ...(parentId && { parentId }) },
      include: { user: { select: { id: true, name: true, avatar: true, role: true } } },
    });

    // Notify post owner (skip self-comments)
    if (post.userId !== userId) {
      const commenter = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
      await prisma.notification.create({
        data: {
          userId: post.userId,
          type: 'COMMENT',
          title: 'New comment',
          message: `${commenter?.name} commented on your post`,
          referenceId: postId,
        },
      });
    }

    // Notify parent comment author if replying (and it's a different user)
    if (parentId) {
      const parent = await prisma.postComment.findUnique({ where: { id: parentId }, select: { userId: true } });
      if (parent && parent.userId !== userId && parent.userId !== post.userId) {
        const commenter = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
        await prisma.notification.create({
          data: {
            userId: parent.userId,
            type: 'COMMENT',
            title: 'New reply',
            message: `${commenter?.name} replied to your comment`,
            referenceId: postId,
          },
        });
      }
    }

    await signMediaDeep(comment);
    res.status(201).json({ comment: { ...comment, likeCount: 0, likedByMe: false, replies: [] } });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/posts/:id/comments/:commentId/like — toggle comment like
router.post('/:id/comments/:commentId/like', authenticate, writeLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const commentId = req.params.commentId as string;
    const userId = req.user!.userId;

    const comment = await prisma.postComment.findUnique({ where: { id: commentId }, select: { id: true, userId: true, postId: true } });
    if (!comment || comment.postId !== (req.params.id as string)) {
      res.status(404).json({ error: 'Comment not found' });
      return;
    }

    const existing = await prisma.commentLike.findUnique({
      where: { commentId_userId: { commentId, userId } },
    });

    if (existing) {
      await prisma.commentLike.delete({ where: { id: existing.id } });
      const likeCount = await prisma.commentLike.count({ where: { commentId } });
      res.json({ liked: false, likeCount });
      return;
    }

    await prisma.commentLike.create({ data: { commentId, userId } });
    const likeCount = await prisma.commentLike.count({ where: { commentId } });
    res.json({ liked: true, likeCount });
  } catch (error) {
    console.error('Comment like error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/posts/:id/comments/:commentId
router.delete('/:id/comments/:commentId', authenticate, writeLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const comment = await prisma.postComment.findUnique({ where: { id: req.params.commentId as string } });
    if (!comment) {
      res.status(404).json({ error: 'Comment not found' });
      return;
    }
    // Allow post owner or comment author to delete
    const post = await prisma.post.findUnique({ where: { id: req.params.id as string }, select: { userId: true } });
    if (comment.userId !== req.user!.userId && post?.userId !== req.user!.userId) {
      res.status(403).json({ error: 'Not authorized' });
      return;
    }
    await prisma.postComment.delete({ where: { id: comment.id } });
    res.json({ message: 'Comment deleted' });
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
