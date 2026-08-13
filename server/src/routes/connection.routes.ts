import { Router, Response } from 'express';
import prisma from '../config/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { socialLimiter } from '../middleware/rateLimiter';
import { notify } from '../services/notifications/notify';
import { attachConnectionStatus } from '../services/connectionState';
import { socialListUsers } from '../services/social';
import { searchablePeopleWhere, isSearchablePerson } from '../services/search/gate';
import { blockedUserIds } from '../services/blocks';

const router = Router();

// A rejected request can be re-sent after this cooldown (people reject by
// accident). The cooldown only applies to the party who WAS rejected re-asking;
// the person who did the rejecting can reconnect at any time.
const REJECT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const DAY_MS = 24 * 60 * 60 * 1000;

const CONNECTION_USER_SELECT = {
  id: true, name: true, avatar: true, role: true, sport: true, position: true, location: true,
} as const;

// Shared accept/reject so the same operation works whether the caller has the
// connection id (profile / grow) or only the other user's id (notification row).
async function acceptPendingConnection(conn: { id: string; senderId: string }, me: string) {
  const updated = await prisma.connection.update({ where: { id: conn.id }, data: { status: 'ACCEPTED' } });
  // Keep the bell count in sync — mark the originating request notification read.
  await prisma.notification.updateMany({
    where: { userId: me, type: 'CONNECTION_REQUEST', referenceId: conn.senderId, read: false },
    data: { read: true },
  });
  const acceptor = await prisma.user.findUnique({ where: { id: me }, select: { name: true } });
  await notify({
    recipientId: conn.senderId, type: 'CONNECTION_ACCEPTED', actorId: me,
    ctx: { actorName: acceptor?.name ?? 'Someone' }, referenceId: me, link: `/profile/${me}`,
  });
  return updated;
}
async function rejectPendingConnection(conn: { id: string; senderId: string }, me: string) {
  const updated = await prisma.connection.update({ where: { id: conn.id }, data: { status: 'REJECTED' } });
  await prisma.notification.updateMany({
    where: { userId: me, type: 'CONNECTION_REQUEST', referenceId: conn.senderId, read: false },
    data: { read: true },
  });
  return updated; // stays silent to the sender by design
}

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
    await notify({
      recipientId: req.params.userId as string,
      type: 'FOLLOW',
      actorId: req.user!.userId,
      ctx: { actorName: follower?.name ?? 'Someone' },
      referenceId: req.user!.userId,
      link: `/profile/${req.user!.userId}`,
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

// POST /api/connections/request/:userId — send connection request.
// Handles the whole lifecycle so there is exactly one row per pair:
//  • no edge yet            → create PENDING
//  • their PENDING to me     → ACCEPT it (reverse-direction guard; no 2nd row)
//  • my PENDING already      → 409 already sent
//  • ACCEPTED                → 409 already connected
//  • REJECTED, I was rejected → 7-day cooldown, else reset the SAME row to PENDING
//  • REJECTED, I did the reject → reset the SAME row to PENDING immediately
router.post('/request/:userId', authenticate, socialLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const me = req.user!.userId;
    const target = req.params.userId as string;
    if (me === target) {
      res.status(400).json({ error: 'Cannot connect with yourself' });
      return;
    }

    const requester = await prisma.user.findUnique({ where: { id: me }, select: { name: true } });
    const notifyRequest = (recipientId: string) => notify({
      recipientId, type: 'CONNECTION_REQUEST', actorId: me,
      ctx: { actorName: requester?.name ?? 'Someone' }, referenceId: me, link: `/profile/${me}`,
    });

    // Any existing edge, in EITHER direction (reverse-direction guard).
    const existing = await prisma.connection.findFirst({
      where: {
        OR: [
          { senderId: me, receiverId: target },
          { senderId: target, receiverId: me },
        ],
      },
    });

    if (existing) {
      if (existing.status === 'ACCEPTED') {
        res.status(409).json({ error: 'You are already connected', connection: existing });
        return;
      }
      if (existing.status === 'PENDING') {
        // They already asked me → pressing Connect accepts their request (no 2nd row).
        if (existing.senderId === target) {
          const accepted = await prisma.connection.update({ where: { id: existing.id }, data: { status: 'ACCEPTED' } });
          await prisma.notification.updateMany({
            where: { userId: me, type: 'CONNECTION_REQUEST', referenceId: target, read: false },
            data: { read: true },
          });
          await notify({
            recipientId: target, type: 'CONNECTION_ACCEPTED', actorId: me,
            ctx: { actorName: requester?.name ?? 'Someone' }, referenceId: me, link: `/profile/${me}`,
          });
          res.status(200).json({ connection: accepted, autoAccepted: true });
          return;
        }
        // My own request is already outstanding.
        res.status(409).json({ error: 'Connection request already sent', connection: existing });
        return;
      }
      // REJECTED — cooldown only binds the party who was rejected (existing sender).
      if (existing.status === 'REJECTED') {
        const iWasRejected = existing.senderId === me;
        const elapsed = Date.now() - existing.updatedAt.getTime();
        if (iWasRejected && elapsed < REJECT_COOLDOWN_MS) {
          const daysLeft = Math.max(1, Math.ceil((REJECT_COOLDOWN_MS - elapsed) / DAY_MS));
          res.status(409).json({
            error: `This request was declined. You can try again in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`,
            cooldown: true,
            retryAt: new Date(existing.updatedAt.getTime() + REJECT_COOLDOWN_MS).toISOString(),
          });
          return;
        }
        // Reuse the SAME row (never a second one): re-point it as my fresh PENDING request.
        const reset = await prisma.connection.update({
          where: { id: existing.id },
          data: { senderId: me, receiverId: target, status: 'PENDING' },
        });
        await notifyRequest(target);
        res.status(201).json({ connection: reset });
        return;
      }
    }

    const connection = await prisma.connection.create({ data: { senderId: me, receiverId: target } });
    await notifyRequest(target);
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

// DELETE /api/connections/:id — remove a connection I'm part of.
// Disconnect (ACCEPTED, either party) or cancel my own outgoing PENDING request.
// A row is deleted (not set REJECTED) so there is no cooldown on a mutual
// disconnect or a self-cancel — the pair can reconnect freely. Declining an
// INCOMING request must go through /reject (which records the cooldown).
router.delete('/:id', authenticate, socialLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const me = req.user!.userId;
    const conn = await prisma.connection.findUnique({ where: { id: req.params.id as string } });
    if (!conn || (conn.senderId !== me && conn.receiverId !== me)) {
      res.status(404).json({ error: 'Connection not found' });
      return;
    }
    if (conn.status === 'PENDING' && conn.receiverId === me) {
      res.status(400).json({ error: 'Decline the request instead' });
      return;
    }
    await prisma.connection.delete({ where: { id: conn.id } });
    res.json({ message: 'Connection removed' });
  } catch (error) {
    console.error('Delete connection error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/connections/:id/accept — by connection id (profile / grow)
router.put('/:id/accept', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const conn = await prisma.connection.findFirst({
      where: { id: req.params.id as string, receiverId: req.user!.userId, status: 'PENDING' },
    });
    if (!conn) { res.status(404).json({ error: 'No pending request to accept' }); return; }
    const connection = await acceptPendingConnection(conn, req.user!.userId);
    res.json({ connection });
  } catch (error) {
    console.error('Accept connection error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/connections/:id/reject — by connection id (profile / grow)
router.put('/:id/reject', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const conn = await prisma.connection.findFirst({
      where: { id: req.params.id as string, receiverId: req.user!.userId, status: 'PENDING' },
    });
    if (!conn) { res.status(404).json({ error: 'No pending request to decline' }); return; }
    const connection = await rejectPendingConnection(conn, req.user!.userId);
    res.json({ connection });
  } catch (error) {
    console.error('Reject connection error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/connections/by-user/:userId/accept — accept the pending request FROM
// :userId. Lets the notification row (which only knows the sender's id) act
// inline without first resolving the connection id.
router.put('/by-user/:userId/accept', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const conn = await prisma.connection.findFirst({
      where: { senderId: req.params.userId as string, receiverId: req.user!.userId, status: 'PENDING' },
    });
    if (!conn) { res.status(404).json({ error: 'No pending request from this user' }); return; }
    const connection = await acceptPendingConnection(conn, req.user!.userId);
    res.json({ connection });
  } catch (error) {
    console.error('Accept connection (by user) error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/connections/by-user/:userId/reject — decline the pending request FROM :userId
router.put('/by-user/:userId/reject', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const conn = await prisma.connection.findFirst({
      where: { senderId: req.params.userId as string, receiverId: req.user!.userId, status: 'PENDING' },
    });
    if (!conn) { res.status(404).json({ error: 'No pending request from this user' }); return; }
    const connection = await rejectPendingConnection(conn, req.user!.userId);
    res.json({ connection });
  } catch (error) {
    console.error('Reject connection (by user) error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/connections/followers — the current user's own followers, safety-filtered
// (guardian-managed / non-discoverable / blocked never appear). See services/social.ts.
router.get('/followers', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    res.json({ followers: await socialListUsers('followers', req.user!.userId, req.user!.userId) });
  } catch (error) {
    console.error('Get followers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/connections/following — the current user's own following, same filtering.
router.get('/following', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    res.json({ following: await socialListUsers('following', req.user!.userId, req.user!.userId) });
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

// GET /api/connections/requests/outgoing — my pending requests awaiting the other side
router.get('/requests/outgoing', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const requests = await prisma.connection.findMany({
      where: { senderId: req.user!.userId, status: 'PENDING' },
      include: { receiver: { select: CONNECTION_USER_SELECT } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ requests });
  } catch (error) {
    console.error('Get outgoing requests error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/connections — my accepted connections (the other party in each edge)
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const me = req.user!.userId;
    const rows = await prisma.connection.findMany({
      where: { status: 'ACCEPTED', OR: [{ senderId: me }, { receiverId: me }] },
      include: { sender: { select: CONNECTION_USER_SELECT }, receiver: { select: CONNECTION_USER_SELECT } },
      orderBy: { updatedAt: 'desc' },
    });
    const connections = rows.map((r) => (r.senderId === me ? r.receiver : r.sender));
    res.json({ connections });
  } catch (error) {
    console.error('Get connections error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/connections/mutual/:userId — mutual accepted connections between current user and :userId
router.get('/mutual/:userId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const me = req.user!.userId;
    const other = req.params.userId as string;
    if (me === other) {
      res.json({
        users: [], count: 0,
        connections: { users: [], count: 0 },
        followers: { users: [], count: 0 },
      });
      return;
    }

    const connectionsOf = async (uid: string) => {
      const rows = await prisma.connection.findMany({
        where: {
          status: 'ACCEPTED',
          OR: [{ senderId: uid }, { receiverId: uid }],
        },
        select: { senderId: true, receiverId: true },
      });
      return new Set(rows.map((r) => (r.senderId === uid ? r.receiverId : r.senderId)));
    };

    const followersOf = async (uid: string) => {
      const rows = await prisma.follow.findMany({
        where: { followingId: uid },
        select: { followerId: true },
      });
      return new Set(rows.map((r) => r.followerId));
    };

    const [myConns, theirConns, myFollowers, theirFollowers] = await Promise.all([
      connectionsOf(me),
      connectionsOf(other),
      followersOf(me),
      followersOf(other),
    ]);

    const mutualConnIds = [...myConns].filter((id) => theirConns.has(id) && id !== me && id !== other);
    const connSet = new Set(mutualConnIds);
    const mutualFollowerIds = [...myFollowers].filter(
      (id) => theirFollowers.has(id) && id !== me && id !== other && !connSet.has(id),
    );

    // Discovery-gate the shown users: a non-discoverable / guardian-managed (minor)
    // account must never be revealed as a mutual connection. (Blocks are already gone
    // from the sets — block tears down the connection — but pass them for safety.)
    const blocked = await blockedUserIds(me);
    const excludedSet = new Set(blocked);
    const gate = searchablePeopleWhere(blocked);
    const sel = { id: true, name: true, avatar: true, role: true, sport: true, position: true, discoverable: true, guardianManaged: true };
    const [connRaw, followerRaw] = await Promise.all([
      prisma.user.findMany({ where: { AND: [{ id: { in: mutualConnIds } }, gate] }, select: sel, take: 20 }),
      prisma.user.findMany({ where: { AND: [{ id: { in: mutualFollowerIds } }, gate] }, select: sel, take: 20 }),
    ]);
    const clean = (arr: any[]) => arr
      .filter((u) => isSearchablePerson(u, excludedSet))
      .map(({ discoverable, guardianManaged, ...u }: any) => u);
    const connUsers = clean(connRaw);
    const followerUsers = clean(followerRaw);

    res.json({
      users: connUsers,
      count: connUsers.length,
      connections: { users: connUsers, count: connUsers.length },
      followers: { users: followerUsers, count: followerUsers.length },
    });
  } catch (error) {
    console.error('Mutual connections error:', error);
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
    const blocked = await blockedUserIds(userId);
    const excludeIds = [userId, ...following.map((f: any) => f.followingId), ...blocked];
    const excludedSet = new Set(excludeIds);

    // Discovery gate — identical to search: no non-discoverable, no guardian-managed
    // minors, no ADMIN/TEAM, no one in a block relationship with the viewer. Fetch a
    // few extra, re-check fail-closed, then take 20 (same-sport first).
    const candidates = await prisma.user.findMany({
      where: searchablePeopleWhere(excludeIds),
      select: { id: true, name: true, avatar: true, role: true, sport: true, position: true, location: true, discoverable: true, guardianManaged: true },
      orderBy: [{ sport: 'asc' }],
      take: 40,
    });
    const suggestions = candidates
      .filter((u: any) => isSearchablePerson(u, excludedSet))
      .map(({ discoverable, guardianManaged, ...u }: any) => u)
      .sort((a: any, b: any) => (a.sport === user.sport ? 0 : 1) - (b.sport === user.sport ? 0 : 1))
      .slice(0, 20);

    await attachConnectionStatus(userId, suggestions as Array<{ id: string }>);
    res.json({ suggestions });
  } catch (error) {
    console.error('Suggestions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
