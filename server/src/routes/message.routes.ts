import { Router, Response } from 'express';
import prisma from '../config/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getIO } from '../config/socket';
import { messageLimiter, writeLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import {
  CreateConversationBody,
  SendMessageBody,
  EditMessageBody,
  ForwardMessageBody,
} from '../validation/message';
import { signMediaDeep } from '../services/storage';

const router = Router();

// ─── Shared select for messages (includes new fields + shared post) ──────

const messageInclude = {
  sender: { select: { id: true, name: true, avatar: true } },
  sharedPost: {
    select: {
      id: true,
      type: true,
      content: true,
      title: true,
      mediaUrl: true,
      sport: true,
      createdAt: true,
      user: { select: { id: true, name: true, avatar: true } },
      media: { orderBy: { position: 'asc' as const }, take: 1 },
    },
  },
  sharedProfile: {
    select: {
      id: true, name: true, avatar: true, role: true, sport: true, position: true, bio: true, verified: true,
    },
  },
};

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

/**
 * Strip content from soft-deleted messages so clients see placeholder text.
 */
function sanitizeDeleted(msg: any) {
  if (msg.deletedAt) {
    return { ...msg, content: '', sharedPost: null, sharedProfile: null };
  }
  return msg;
}

// ─── GET /api/messages/unread-count ──────────────────────────
// Returns the number of distinct conversations with unread incoming messages
// (i.e. how many senders have sent you something you haven't opened yet).

router.get('/unread-count', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const members = await prisma.conversationMember.findMany({
      where: { userId: req.user!.userId },
      select: { conversationId: true, lastReadAt: true },
    });
    if (members.length === 0) {
      res.json({ count: 0 });
      return;
    }

    let count = 0;
    await Promise.all(
      members.map(async (m) => {
        const hasUnread = await prisma.message.findFirst({
          where: {
            conversationId: m.conversationId,
            senderId: { not: req.user!.userId },
            ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
          },
          select: { id: true },
        });
        if (hasUnread) count += 1;
      }),
    );

    res.json({ count });
  } catch (error) {
    console.error('Unread count error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/messages/conversations ─────────────────────────────

router.get('/conversations', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { archived } = req.query;
    const isArchived = archived === 'true';

    const conversations = await prisma.conversation.findMany({
      where: {
        members: { some: { userId: req.user!.userId, isArchived } },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true, name: true, avatar: true,
                showOnlineStatus: true, lastActiveAt: true,
              },
            },
          },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: { sender: { select: { id: true, name: true } } },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Sanitize the last message preview for soft-deleted messages
    const sanitized = conversations.map((c) => ({
      ...c,
      messages: c.messages.map(sanitizeDeleted),
    }));

    res.json({ conversations: sanitized });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/messages/conversations ────────────────────────────

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

    // Check for existing 1-on-1 conversation
    const existing = await prisma.conversation.findFirst({
      where: {
        isGroup: false,
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

    // Block check: prevent starting a conversation if either side has blocked the other
    const block = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: req.user!.userId, blockedId: userId },
          { blockerId: userId, blockedId: req.user!.userId },
        ],
      },
    });
    if (block) {
      res.status(403).json({ error: 'Cannot message this user' });
      return;
    }

    // Followers-only check: if target user has restricted messaging, sender must follow them
    if (targetUser.messagingFollowersOnly) {
      const follows = await prisma.follow.findUnique({
        where: { followerId_followingId: { followerId: req.user!.userId, followingId: userId } },
      });
      if (!follows) {
        res.status(403).json({ error: 'This user only accepts messages from followers' });
        return;
      }
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
    console.error('Create conversation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/messages/conversations/:id ─────────────────────────

router.get('/conversations/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const conversationId = req.params.id as string;

    // IDOR: verify caller is a member of this conversation
    if (!(await assertMember(conversationId, req.user!.userId, res))) return;

    const { page = '1', limit = '50' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const messages = await prisma.message.findMany({
      where: { conversationId },
      include: messageInclude,
      skip,
      take: parseInt(limit as string),
      orderBy: { createdAt: 'asc' },
    });

    // Sign media URLs for shared post previews and sanitize deleted messages
    for (const msg of messages) {
      if (msg.sharedPost) await signMediaDeep(msg.sharedPost);
      if (msg.sharedProfile) await signMediaDeep(msg.sharedProfile);
    }
    const sanitized = messages.map(sanitizeDeleted);

    res.json({ messages: sanitized });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PATCH /api/messages/conversations/:id/read ──────────────
// Mark a conversation as read for the current user.
router.patch('/conversations/:id/read', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const conversationId = req.params.id as string;
    if (!(await assertMember(conversationId, req.user!.userId, res))) return;
    await prisma.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId: req.user!.userId } },
      data: { lastReadAt: new Date() },
    });
    res.json({ read: true });
  } catch (error) {
    console.error('Mark conversation read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/messages/conversations/:id ────────────────────────
// Send a new message (text and/or shared post)

router.post('/conversations/:id', authenticate, messageLimiter, validate({ body: SendMessageBody }), async (req: AuthRequest, res: Response) => {
  try {
    const conversationId = req.params.id as string;
    const { content, sharedPostId, sharedProfileId } = req.body;
    const messageContent =
      content ||
      (sharedPostId ? '[Shared post]' : '') ||
      (sharedProfileId ? '[Shared profile]' : '');

    if (!messageContent && !sharedPostId && !sharedProfileId) {
      res.status(400).json({ error: 'Message content, shared post, or shared profile is required' });
      return;
    }

    // IDOR: verify caller is a member of this conversation
    if (!(await assertMember(conversationId, req.user!.userId, res))) return;

    // Validate sharedPostId if provided
    if (sharedPostId) {
      const post = await prisma.post.findUnique({ where: { id: sharedPostId }, select: { id: true } });
      if (!post) {
        res.status(404).json({ error: 'Post not found' });
        return;
      }
    }

    // Validate sharedProfileId if provided
    if (sharedProfileId) {
      const profile = await prisma.user.findUnique({ where: { id: sharedProfileId }, select: { id: true, role: true } });
      if (!profile || profile.role === 'ADMIN') {
        res.status(404).json({ error: 'Profile not found' });
        return;
      }
    }

    const message = await prisma.message.create({
      data: {
        conversationId,
        senderId: req.user!.userId,
        content: messageContent,
        ...(sharedPostId && { sharedPostId }),
        ...(sharedProfileId && { sharedProfileId }),
      },
      include: messageInclude,
    });

    // Sign shared post media if present
    if (message.sharedPost) await signMediaDeep(message.sharedPost);
    if (message.sharedProfile) await signMediaDeep(message.sharedProfile);

    // Update conversation timestamp
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    // Un-archive the conversation for all members since there is a new message
    await prisma.conversationMember.updateMany({
      where: { conversationId },
      data: { isArchived: false },
    });

    // Notify other members who have message notifications enabled and haven't blocked the sender
    const others = await prisma.conversationMember.findMany({
      where: { conversationId, NOT: { userId: req.user!.userId } },
      select: { userId: true },
    });
    if (others.length > 0) {
      const recipients = await prisma.user.findMany({
        where: {
          id: { in: others.map((m) => m.userId) },
          messageNotifications: true,
          NOT: {
            OR: [
              { blocksMade:     { some: { blockedId: req.user!.userId } } },
              { blocksReceived: { some: { blockerId: req.user!.userId } } },
            ],
          },
        },
        select: { id: true },
      });
      if (recipients.length > 0) {
        const preview = sharedPostId
          ? `${message.sender.name} shared a post`
          : sharedProfileId
          ? `${message.sender.name} shared a profile`
          : `${message.sender.name}: ${String(messageContent).slice(0, 80)}`;
        await prisma.notification.createMany({
          data: recipients.map((r) => ({
            userId: r.id,
            type: 'MESSAGE' as const,
            title: 'New message',
            message: preview,
            referenceId: conversationId,
          })),
        });
      }
    }

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
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PATCH /api/messages/:id/edit ────────────────────────────
// Edit a message (sender only). No time limit.

router.patch('/:id/edit', authenticate, writeLimiter, validate({ body: EditMessageBody }), async (req: AuthRequest, res: Response) => {
  try {
    const messageId = req.params.id as string;
    const { content } = req.body;

    const existing = await prisma.message.findUnique({
      where: { id: messageId },
      select: { senderId: true, conversationId: true, deletedAt: true },
    });

    if (!existing) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
    if (existing.senderId !== req.user!.userId) {
      res.status(403).json({ error: 'You can only edit your own messages' });
      return;
    }
    if (existing.deletedAt) {
      res.status(400).json({ error: 'Cannot edit a deleted message' });
      return;
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { content, editedAt: new Date() },
      include: messageInclude,
    });

    // Broadcast edit event
    try {
      getIO().to(`conversation:${existing.conversationId}`).emit('message_edited', {
        ...updated,
        conversationId: existing.conversationId,
      });
    } catch {
      // Socket.IO not initialized, skip
    }

    res.json({ message: updated });
  } catch (error) {
    console.error('Edit message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── DELETE /api/messages/:id ────────────────────────────────
// Soft-delete / unsend a message (sender only).

router.delete('/:id', authenticate, writeLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const messageId = req.params.id as string;

    const existing = await prisma.message.findUnique({
      where: { id: messageId },
      select: { senderId: true, conversationId: true, deletedAt: true },
    });

    if (!existing) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
    if (existing.senderId !== req.user!.userId) {
      res.status(403).json({ error: 'You can only unsend your own messages' });
      return;
    }
    if (existing.deletedAt) {
      res.status(400).json({ error: 'Message already deleted' });
      return;
    }

    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date(), content: '' },
      include: messageInclude,
    });

    // Broadcast delete event
    try {
      getIO().to(`conversation:${existing.conversationId}`).emit('message_deleted', {
        id: updated.id,
        conversationId: existing.conversationId,
        deletedAt: updated.deletedAt,
      });
    } catch {
      // Socket.IO not initialized, skip
    }

    res.json({ message: { id: updated.id, deleted: true } });
  } catch (error) {
    console.error('Unsend message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /api/messages/:id/forward ──────────────────────────
// Forward a message to another conversation.

router.post('/:id/forward', authenticate, messageLimiter, validate({ body: ForwardMessageBody }), async (req: AuthRequest, res: Response) => {
  try {
    const messageId = req.params.id as string;
    const { targetConversationId } = req.body;

    // Find the original message
    const original = await prisma.message.findUnique({
      where: { id: messageId },
      select: { content: true, conversationId: true, sharedPostId: true, sharedProfileId: true, deletedAt: true },
    });

    if (!original) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
    if (original.deletedAt) {
      res.status(400).json({ error: 'Cannot forward a deleted message' });
      return;
    }

    // Verify caller is member of both source and target conversations
    if (!(await assertMember(original.conversationId, req.user!.userId, res))) return;
    if (!(await assertMember(targetConversationId, req.user!.userId, res))) return;

    // Create a new message in the target conversation
    const forwarded = await prisma.message.create({
      data: {
        conversationId: targetConversationId,
        senderId: req.user!.userId,
        content: original.content,
        ...(original.sharedPostId && { sharedPostId: original.sharedPostId }),
        ...(original.sharedProfileId && { sharedProfileId: original.sharedProfileId }),
      },
      include: messageInclude,
    });

    if (forwarded.sharedPost) await signMediaDeep(forwarded.sharedPost);
    if (forwarded.sharedProfile) await signMediaDeep(forwarded.sharedProfile);

    // Update target conversation timestamp
    await prisma.conversation.update({
      where: { id: targetConversationId },
      data: { updatedAt: new Date() },
    });

    // Broadcast to target conversation room
    try {
      getIO().to(`conversation:${targetConversationId}`).emit('message', {
        ...forwarded,
        conversationId: targetConversationId,
      });
    } catch {
      // Socket.IO not initialized, skip
    }

    res.status(201).json({ message: forwarded });
  } catch (error) {
    console.error('Forward message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── PATCH /api/messages/conversations/:id/archive ───────────
// Toggle archive status for a conversation for the current user

router.patch('/conversations/:id/archive', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const conversationId = req.params.id as string;
    const { isArchived } = req.body;

    const member = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: req.user!.userId } },
    });

    if (!member) {
      res.status(404).json({ error: 'Conversation member not found' });
      return;
    }

    await prisma.conversationMember.update({
      where: { id: member.id },
      data: { isArchived: isArchived === true },
    });

    res.json({ success: true, isArchived: isArchived === true });
  } catch (error) {
    console.error('Archive conversation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── DELETE /api/messages/conversations/:id/exit ─────────────
// Exit a conversation (delete ConversationMember record)

router.delete('/conversations/:id/exit', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const conversationId = req.params.id as string;

    const member = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId: req.user!.userId } },
    });

    if (!member) {
      res.status(404).json({ error: 'Not a member of this conversation' });
      return;
    }

    await prisma.conversationMember.delete({
      where: { id: member.id },
    });

    // If the conversation is now totally empty, maybe delete it altogether
    const remaining = await prisma.conversationMember.count({
      where: { conversationId },
    });

    if (remaining === 0) {
      await prisma.conversation.delete({ where: { id: conversationId } });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Exit conversation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /api/messages/presence/:userId ──────────────────────
// Get online status of a user (respects privacy toggle).

router.get('/presence/:userId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const target = await prisma.user.findUnique({
      where: { id: req.params.userId as string },
      select: { showOnlineStatus: true, lastActiveAt: true },
    });

    if (!target) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // If user has disabled online status, return null
    if (!target.showOnlineStatus) {
      res.json({ online: null, lastActiveAt: null });
      return;
    }

    // Consider "online" if active within the last 2 minutes
    const isOnline = target.lastActiveAt
      ? Date.now() - new Date(target.lastActiveAt).getTime() < 2 * 60 * 1000
      : false;

    res.json({
      online: isOnline,
      lastActiveAt: target.lastActiveAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error('Presence error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
