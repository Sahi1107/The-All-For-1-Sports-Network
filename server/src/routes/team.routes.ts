import { Router, Response } from 'express';
import prisma from '../config/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { writeLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import { getIO } from '../config/socket';
import { TeamSearchQuery } from '../validation/team';

const router = Router();

// GET /api/teams — browse teams (filter by sport/search)
router.get('/', authenticate, validate({ query: TeamSearchQuery }), async (req: AuthRequest, res: Response) => {
  try {
    const { sport, search, page = '1', limit = '20' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {};
    if (sport) where.sport = sport;
    if (search) where.name = { contains: search as string, mode: 'insensitive' };

    const [teams, total] = await Promise.all([
      prisma.team.findMany({
        where,
        include: {
          captain: { select: { id: true, name: true, avatar: true } },
          _count: { select: { members: true } },
        },
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.team.count({ where }),
    ]);

    res.json({ teams, total, page: parseInt(page as string), totalPages: Math.ceil(total / parseInt(limit as string)) });
  } catch (error) {
    console.error('Get teams error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/teams/:id — team detail
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const team = await prisma.team.findUnique({
      where: { id: req.params.id as string },
      include: {
        captain: { select: { id: true, name: true, avatar: true, sport: true } },
        coach:   { select: { id: true, name: true, avatar: true, sport: true } },
        members: {
          include: { user: { select: { id: true, name: true, avatar: true, position: true, sport: true } } },
        },
        tournament: { select: { id: true, name: true, status: true, startDate: true } },
        tournamentRegistrations: {
          include: { tournament: { select: { id: true, name: true, status: true, startDate: true } } },
        },
      },
    });

    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    res.json({ team });
  } catch (error) {
    console.error('Get team error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/teams/:teamId/members/me/accept — accept a team invite
router.post('/:teamId/members/me/accept', authenticate, writeLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const teamId = req.params.teamId as string;
    const userId = req.user!.userId;

    const member = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });
    if (!member) {
      res.status(404).json({ error: 'No invite found for you on this team' });
      return;
    }
    if (member.status === 'ACCEPTED') {
      res.json({ member, alreadyAccepted: true });
      return;
    }
    if (member.status === 'DECLINED') {
      res.status(409).json({ error: 'You already declined this invite' });
      return;
    }

    const updated = await prisma.teamMember.update({
      where: { id: member.id },
      data: { status: 'ACCEPTED', respondedAt: new Date() },
    });

    // Is the registration now complete? (no pending, no declined)
    const [pendingCount, declinedCount] = await Promise.all([
      prisma.teamMember.count({ where: { teamId, status: 'PENDING' } }),
      prisma.teamMember.count({ where: { teamId, status: 'DECLINED' } }),
    ]);
    const isComplete = pendingCount === 0 && declinedCount === 0;

    let chatCreated = false;
    if (isComplete) {
      // Guard against duplicate chats if this endpoint races with itself.
      const existingChat = await prisma.conversation.findFirst({ where: { teamId } });
      if (!existingChat) {
        const team = await prisma.team.findUnique({
          where: { id: teamId },
          include: {
            tournament: { select: { name: true } },
            members: { select: { userId: true } },
          },
        });
        if (team) {
          const memberUserIds = team.members.map((m) => m.userId);
          const conv = await prisma.conversation.create({
            data: {
              isGroup: true,
              name: team.tournament ? `${team.name} (${team.tournament.name})` : team.name,
              teamId,
              members: { create: memberUserIds.map((uid) => ({ userId: uid })) },
            },
            include: {
              members: { include: { user: { select: { id: true, name: true, avatar: true } } } },
            },
          });
          chatCreated = true;

          const io = getIO();
          for (const uid of memberUserIds) {
            try { io.to(`user:${uid}`).emit('new_conversation', conv); } catch { /* ignore */ }
          }
        }
      }
    }

    res.json({ member: updated, isComplete, chatCreated });
  } catch (error) {
    console.error('Accept team invite error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/teams/:teamId/members/me/decline — decline a team invite
router.post('/:teamId/members/me/decline', authenticate, writeLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const teamId = req.params.teamId as string;
    const userId = req.user!.userId;

    const member = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });
    if (!member) {
      res.status(404).json({ error: 'No invite found for you on this team' });
      return;
    }
    if (member.status === 'DECLINED') {
      res.json({ member, alreadyDeclined: true });
      return;
    }
    if (member.status === 'ACCEPTED') {
      res.status(409).json({ error: 'You already accepted this invite' });
      return;
    }

    const updated = await prisma.teamMember.update({
      where: { id: member.id },
      data: { status: 'DECLINED', respondedAt: new Date() },
    });

    // Notify the captain so they can chase / replace.
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      select: { name: true, captainId: true },
    });
    const decliningUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    if (team && decliningUser && team.captainId !== userId) {
      await prisma.notification.create({
        data: {
          userId: team.captainId,
          type: 'TEAM_INVITE',
          title: 'Invite declined',
          message: `${decliningUser.name} declined your invite to ${team.name}`,
          referenceId: teamId,
        },
      });
    }

    res.json({ member: updated });
  } catch (error) {
    console.error('Decline team invite error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/teams/:id/members/:userId — captain removes a member
router.delete('/:id/members/:userId', authenticate, writeLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const team = await prisma.team.findUnique({ where: { id: req.params.id as string } });
    if (!team || team.captainId !== req.user!.userId) {
      res.status(403).json({ error: 'Only the captain can remove members' });
      return;
    }
    if (req.params.userId === team.captainId) {
      res.status(400).json({ error: 'Cannot remove the captain' });
      return;
    }
    await prisma.teamMember.delete({
      where: { teamId_userId: { teamId: req.params.id as string, userId: req.params.userId as string } },
    });
    res.json({ message: 'Member removed' });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/teams/:id/members/:userId/replace — captain atomically swaps a declined/pending member for someone new
router.post('/:id/members/:userId/replace', authenticate, writeLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const teamId = req.params.id as string;
    const oldUserId = req.params.userId as string;
    const { newUserId } = req.body as { newUserId?: string };
    if (!newUserId || typeof newUserId !== 'string') {
      res.status(400).json({ error: 'newUserId is required' });
      return;
    }
    if (newUserId === oldUserId) {
      res.status(400).json({ error: 'Replacement must be a different user' });
      return;
    }

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: { tournament: true },
    });
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }
    if (team.captainId !== req.user!.userId) {
      res.status(403).json({ error: 'Only the captain can replace members' });
      return;
    }
    if (oldUserId === team.captainId) {
      res.status(400).json({ error: 'Cannot replace the captain' });
      return;
    }
    if (!team.tournamentId || !team.tournament) {
      res.status(400).json({ error: 'This team is not attached to a tournament' });
      return;
    }

    const oldMember = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: oldUserId } },
    });
    if (!oldMember) {
      res.status(404).json({ error: 'Member to replace not found' });
      return;
    }
    if (oldMember.status === 'ACCEPTED') {
      res.status(400).json({ error: 'Cannot replace an accepted member — remove them instead' });
      return;
    }

    const existingNew = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: newUserId } },
    });
    if (existingNew) {
      res.status(409).json({ error: 'Replacement user is already on the roster' });
      return;
    }

    const invitee = await prisma.user.findUnique({
      where: { id: newUserId },
      select: { id: true, name: true },
    });
    if (!invitee) {
      res.status(400).json({ error: 'Replacement user not found' });
      return;
    }

    // Roster cap: count "after the swap" active members (excluding DECLINED).
    // If we're replacing a DECLINED slot, the active count goes up by 1; otherwise it stays the same.
    if (team.tournament.maxRosterSize != null && oldMember.status === 'DECLINED') {
      const activePlayers = await prisma.teamMember.count({
        where: { teamId, role: { in: ['CAPTAIN', 'PLAYER'] }, status: { not: 'DECLINED' } },
      });
      if (activePlayers >= team.tournament.maxRosterSize) {
        res.status(400).json({ error: `Roster is already at the maximum of ${team.tournament.maxRosterSize}` });
        return;
      }
    }

    const newMember = await prisma.$transaction(async (tx) => {
      await tx.teamMember.delete({
        where: { id: oldMember.id },
      });
      return tx.teamMember.create({
        data: {
          teamId,
          userId: newUserId,
          role: oldMember.role === 'COACH' ? 'COACH' : 'PLAYER',
          status: 'PENDING',
        },
      });
    });

    await prisma.notification.create({
      data: {
        userId: newUserId,
        type: 'TEAM_INVITE',
        title: 'Team invitation',
        message: `You've been invited to ${team.name} for ${team.tournament.name}`,
        referenceId: teamId,
      },
    });

    res.status(201).json({ replaced: oldMember.userId, member: newMember });
  } catch (error) {
    console.error('Replace member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/teams/:id/members/invite — captain invites a replacement player
router.post('/:id/members/invite', authenticate, writeLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const teamId = req.params.id as string;
    const { userId } = req.body as { userId?: string };
    if (!userId || typeof userId !== 'string') {
      res.status(400).json({ error: 'userId is required' });
      return;
    }

    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: { tournament: true },
    });
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }
    if (team.captainId !== req.user!.userId) {
      res.status(403).json({ error: 'Only the captain can invite members' });
      return;
    }
    if (!team.tournamentId || !team.tournament) {
      res.status(400).json({ error: 'This team is not attached to a tournament' });
      return;
    }

    // Reject if the invitee is already a member (any status).
    const existing = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });
    if (existing) {
      res.status(409).json({ error: 'This user is already on the roster' });
      return;
    }

    // Enforce roster cap, excluding declined members (they no longer count).
    if (team.tournament.maxRosterSize != null) {
      const activePlayers = await prisma.teamMember.count({
        where: { teamId, role: { in: ['CAPTAIN', 'PLAYER'] }, status: { not: 'DECLINED' } },
      });
      if (activePlayers >= team.tournament.maxRosterSize) {
        res.status(400).json({ error: `Roster is already at the maximum of ${team.tournament.maxRosterSize}` });
        return;
      }
    }

    const invitee = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true },
    });
    if (!invitee) {
      res.status(400).json({ error: 'Selected user not found' });
      return;
    }

    const member = await prisma.teamMember.create({
      data: { teamId, userId, role: 'PLAYER', status: 'PENDING' },
    });

    await prisma.notification.create({
      data: {
        userId,
        type: 'TEAM_INVITE',
        title: 'Team invitation',
        message: `You've been invited to ${team.name} for ${team.tournament.name}`,
        referenceId: teamId,
      },
    });

    res.status(201).json({ member });
  } catch (error) {
    console.error('Invite member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
