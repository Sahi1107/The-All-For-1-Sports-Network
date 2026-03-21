import { Router, Response } from 'express';
import prisma from '../config/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getIO } from '../config/socket';
import { messageLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import { CreateConversationBody, SendMessageBody } from '../validation/message';
import logger from '../utils/logger';

const router = Router();

// ─── Helper ───────────────────────────────────────────────────

/**
 * Verify that the requesting user is a member of the given conversation.
 * Returns true if they are, or false + sends 403 if they aren't.
 */
async function assertMember(
  conversationId: string,
  userId: string,
  res: Response,
): Promise<boolean> {
  const membership = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!membership) {
    res.status(403).json({ error: 'Access denied' });
    return false;
  }
  return true;
}

// ─── GET /api/messages/conversations ─────────────────────────

router.get('/conversations', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const conversations = await prisma.conversation.findMany({
      where: {
        members: { some: { userId: req.user!.userId } },
      },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, avatar: true } } },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: { sender: { select: { id: true, name: true } } },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    res.json({ conversations });
  } catch (error) {
    logger.error('Get conversations error:', { error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/messages/conversations ────────────────────────

router.post('/conversations', authenticate, validate({ body: CreateConversationBody }), async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      res.status(400).json({ error: 'User ID is required' });
      return;
    }

    // Prevent messaging yourself
    if (userId === req.user!.userId) {
      res.status(400).json({ error: 'Cannot create a conversation with yourself' });
      return;
    }

    // Check for existing conversation between these two users
    const existing = await prisma.conversation.findFirst({
      where: {
        AND: [
          { members: { some: { userId: req.user!.userId } } },
          { members: { some: { userId } } },
        ],
      },
      include: {
        members: { include: { user: { select: { id: true, name: true, avatar: true } } } },
      },
    });

    if (existing) {
      res.json({ conversation: existing });
      return;
    }

    // Verify the target user exists before creating a conversation
    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const conversation = await prisma.conversation.create({
      data: {
        members: {
          create: [{ userId: req.user!.userId }, { userId }],
        },
      },
      include: {
        members: { include: { user: { select: { id: true, name: true, avatar: true } } } },
      },
    });

    res.status(201).json({ conversation });
  } catch (error) {
    logger.error('Create conversation error:', { error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/messages/conversations/:id ─────────────────────

router.get('/conversations/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const conversationId = req.params.id as string;

    // IDOR: verify caller is a member of this conversation
    if (!(await assertMember(conversationId, req.user!.userId, res))) return;

    const { page = '1', limit = '50' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const messages = await prisma.message.findMany({
      where: { conversationId },
      include: { sender: { select: { id: true, name: true, avatar: true } } },
      skip,
      take: parseInt(limit as string),
      orderBy: { createdAt: 'asc' },
    });

    res.json({ messages });
  } catch (error) {
    logger.error('Get messages error:', { error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/messages/conversations/:id ────────────────────

router.post('/conversations/:id', authenticate, messageLimiter, validate({ body: SendMessageBody }), async (req: AuthRequest, res: Response) => {
  try {
    const conversationId = req.params.id as string;
    const { content } = req.body;
    if (!content) {
      res.status(400).json({ error: 'Message content is required' });
      return;
    }

    // IDOR: verify caller is a member of this conversation
    if (!(await assertMember(conversationId, req.user!.userId, res))) return;

    const message = await prisma.message.create({
      data: {
        conversationId,
        senderId: req.user!.userId,
        content,
      },
      include: { sender: { select: { id: true, name: true, avatar: true } } },
    });

    // Update conversation timestamp
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    // Broadcast to all sockets in the conversation room
    try {
      getIO().to(`conversation:${conversationId}`).emit('message', {
        ...message,
        conversationId,
      });
    } catch {
      // Socket.IO not yet initialized (test env), skip
    }

    res.status(201).json({ message });
  } catch (error) {
    logger.error('Send message error:', { error: String(error) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
