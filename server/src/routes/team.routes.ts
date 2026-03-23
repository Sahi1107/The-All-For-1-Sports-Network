import { Router, Response } from 'express';
import prisma from '../config/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { writeLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import { CreateTeamBody, TeamSearchQuery } from '../validation/team';

const router = Router();

// POST /api/teams — create team
router.post('/', authenticate, writeLimiter, validate({ body: CreateTeamBody }), async (req: AuthRequest, res: Response) => {
  try {
    const { name, sport, description } = req.body;
    if (!name || !sport) {
      res.status(400).json({ error: 'Name and sport are required' });
      return;
    }

    const team = await prisma.team.create({
      data: {
        name,
        sport,
        description,
        captainId: req.user!.userId,
        members: {
          create: { userId: req.user!.userId, role: 'CAPTAIN' },
        },
      },
      include: { members: { include: { user: { select: { id: true, name: true, avatar: true, position: true } } } } },
    });

    res.status(201).json({ team });
  } catch (error) {
    console.error('Create team error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/teams
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

// GET /api/teams/:id
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const team = await prisma.team.findUnique({
      where: { id: req.params.id as string },
      include: {
        captain: { select: { id: true, name: true, avatar: true, sport: true } },
        members: {
          include: { user: { select: { id: true, name: true, avatar: true, position: true, sport: true } } },
        },
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

// POST /api/teams/:id/join — request to join
router.post('/:id/join', authenticate, writeLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const team = await prisma.team.findUnique({ where: { id: req.params.id as string } });
    if (!team) {
      res.status(404).json({ error: 'Team not found' });
      return;
    }

    const member = await prisma.teamMember.create({
      data: { teamId: req.params.id as string, userId: req.user!.userId, role: 'PLAYER' },
    });

    await prisma.notification.create({
      data: {
        userId: team.captainId,
        type: 'TEAM_JOIN_REQUEST',
        title: 'New Team Member',
        message: `A player joined your team ${team.name}`,
        referenceId: req.params.id as string,
      },
    });

    res.status(201).json({ member });
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(409).json({ error: 'Already a member' });
      return;
    }
    console.error('Join team error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/teams/:id/leave
router.delete('/:id/leave', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.teamMember.delete({
      where: { teamId_userId: { teamId: req.params.id as string, userId: req.user!.userId } },
    });
    res.json({ message: 'Left team' });
  } catch (error) {
    console.error('Leave team error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/teams/:id/members/:userId — remove member (captain only)
router.delete('/:id/members/:userId', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const team = await prisma.team.findUnique({ where: { id: req.params.id as string } });
    if (!team || team.captainId !== req.user!.userId) {
      res.status(403).json({ error: 'Only captain can remove members' });
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

export default router;
