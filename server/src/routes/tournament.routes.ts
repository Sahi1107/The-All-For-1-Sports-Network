import { Router, Response } from 'express';
import multer from 'multer';
import prisma from '../config/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { writeLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import { validateImageBytes } from '../middleware/upload';
import { uploadToGCS, signMediaDeep, signMediaDeepAll } from '../services/storage';
import { writeMatchPlayerStats } from '../services/matchStats';
import {
  CreateTournamentBody, UpdateTournamentBody, TournamentListQuery,
  RegisterTeamBody, CreateMatchBody, MatchResultBody,
} from '../validation/tournament';

const router = Router();

const thumbnailUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const teamLogoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

function extFromFile(file: Express.Multer.File): string {
  const fromMime = file.mimetype.split('/')[1] || 'bin';
  return fromMime === 'jpeg' ? 'jpg' : fromMime.replace(/[^a-z0-9]/gi, '');
}

// POST /api/tournaments — create (admin only)
router.post(
  '/',
  authenticate,
  requireRole('ADMIN'),
  writeLimiter,
  thumbnailUpload.single('thumbnail'),
  validate({ body: CreateTournamentBody }),
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        name, sport, category, description, venue, city,
        startDate, endDate, prizePool, entryFee, maxTeams,
        ageCategory, genderCategory, format, minRosterSize, maxRosterSize,
      } = req.body;

      let thumbnailUrl: string | null = null;
      if (req.file) {
        if (!validateImageBytes(req.file, res)) return;
        thumbnailUrl = await uploadToGCS(
          req.file.buffer, 'tournaments', extFromFile(req.file), req.file.mimetype,
        );
      }

      const tournament = await prisma.tournament.create({
        data: {
          name, sport, category, description, venue, city,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          prizePool: prizePool != null ? parseFloat(prizePool) : null,
          entryFee:  entryFee  != null ? parseFloat(entryFee)  : null,
          maxTeams:  maxTeams  != null ? parseInt(maxTeams)    : null,
          ageCategory:    ageCategory    || null,
          genderCategory: genderCategory || null,
          thumbnailUrl,
          status: 'UPCOMING',
          format: format ?? 'TEAM',
          minRosterSize: minRosterSize != null ? parseInt(minRosterSize) : null,
          maxRosterSize: maxRosterSize != null ? parseInt(maxRosterSize) : null,
          createdById: req.user!.userId,
        },
      });

      await signMediaDeep(tournament);
      res.status(201).json({ tournament });
    } catch (error) {
      console.error('Create tournament error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// DELETE /api/tournaments/:id — delete (admin only)
router.delete('/:id', authenticate, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    await prisma.tournament.delete({ where: { id: req.params.id as string } });
    res.json({ message: 'Tournament deleted' });
  } catch (error: any) {
    if (error.code === 'P2025') {
      res.status(404).json({ error: 'Tournament not found' });
      return;
    }
    console.error('Delete tournament error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tournaments
router.get('/', authenticate, validate({ query: TournamentListQuery }), async (req: AuthRequest, res: Response) => {
  try {
    const { sport, status, page = '1', limit = '20' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {};
    if (sport) where.sport = sport;
    if (status) where.status = status;

    const [tournaments, total] = await Promise.all([
      prisma.tournament.findMany({
        where,
        include: { _count: { select: { teams: true, matches: true } } },
        skip,
        take: parseInt(limit as string),
        orderBy: { startDate: 'desc' },
      }),
      prisma.tournament.count({ where }),
    ]);

    await signMediaDeepAll(tournaments);
    res.json({ tournaments, total, page: parseInt(page as string), totalPages: Math.ceil(total / parseInt(limit as string)) });
  } catch (error) {
    console.error('Get tournaments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tournaments/:id
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const tournamentId = req.params.id as string;
    const userId = req.user!.userId;

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        teams: {
          include: {
            team: { include: { captain: { select: { id: true, name: true, avatar: true } }, _count: { select: { members: true } } } },
          },
        },
        matches: {
          include: {
            homeTeam: { select: { id: true, name: true, logo: true } },
            awayTeam: { select: { id: true, name: true, logo: true } },
          },
          orderBy: { matchDate: 'asc' },
        },
        rankings: {
          include: { user: { select: { id: true, name: true, avatar: true, position: true } } },
          orderBy: { rank: 'asc' },
          take: 50,
        },
      },
    });

    if (!tournament) {
      res.status(404).json({ error: 'Tournament not found' });
      return;
    }

    // Teams the requester is a member of (or captain/coach of) for this tournament.
    const myTeamsRaw = await prisma.team.findMany({
      where: {
        tournamentId,
        OR: [
          { captainId: userId },
          { coachId: userId },
          { members: { some: { userId } } },
        ],
      },
      include: {
        captain: { select: { id: true, name: true, avatar: true } },
        coach:   { select: { id: true, name: true, avatar: true } },
        members: {
          include: { user: { select: { id: true, name: true, avatar: true, position: true } } },
          orderBy: { invitedAt: 'asc' },
        },
      },
    });

    const myTeams = myTeamsRaw.map((t) => {
      const total    = t.members.length;
      const accepted = t.members.filter((m) => m.status === 'ACCEPTED').length;
      const pending  = t.members.filter((m) => m.status === 'PENDING').length;
      const declined = t.members.filter((m) => m.status === 'DECLINED').length;
      const myMembership = t.members.find((m) => m.userId === userId) ?? null;
      const myRole =
        t.captainId === userId ? 'CAPTAIN'
        : t.coachId === userId ? 'COACH'
        : myMembership?.role ?? null;
      return {
        ...t,
        summary: { total, accepted, pending, declined, isComplete: pending === 0 && declined === 0 },
        myRole,
        myStatus: myMembership?.status ?? null,
      };
    });

    (tournament as any).myTeams = myTeams;

    await signMediaDeep(tournament);
    res.json({ tournament });
  } catch (error) {
    console.error('Get tournament error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/tournaments/:id — update (admin only)
router.put('/:id', authenticate, requireRole('ADMIN'), validate({ body: UpdateTournamentBody }), async (req: AuthRequest, res: Response) => {
  try {
    const { name, status, description, venue, city, prizePool, maxTeams, minRosterSize, maxRosterSize } = req.body;

    const tournament = await prisma.tournament.update({
      where: { id: req.params.id as string },
      data: {
        ...(name && { name }),
        ...(status && { status }),
        ...(description !== undefined && { description }),
        ...(venue !== undefined && { venue }),
        ...(city !== undefined && { city }),
        ...(prizePool !== undefined && { prizePool: parseFloat(prizePool) }),
        ...(maxTeams !== undefined && { maxTeams: parseInt(maxTeams) }),
        ...(minRosterSize !== undefined && { minRosterSize: parseInt(minRosterSize) }),
        ...(maxRosterSize !== undefined && { maxRosterSize: parseInt(maxRosterSize) }),
      },
    });

    res.json({ tournament });
  } catch (error) {
    console.error('Update tournament error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tournaments/:id/register — create a per-tournament team and invite players
router.post(
  '/:id/register',
  authenticate,
  writeLimiter,
  teamLogoUpload.single('logo'),
  validate({ body: RegisterTeamBody }),
  async (req: AuthRequest, res: Response) => {
  try {
    const tournamentId = req.params.id as string;
    const creatorId = req.user!.userId;
    const { teamName, captainUserId, coachUserId, playerUserIds } = req.body as {
      teamName: string;
      captainUserId: string;
      coachUserId?: string;
      playerUserIds: string[];
    };

    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) {
      res.status(404).json({ error: 'Tournament not found' });
      return;
    }
    if (!['UPCOMING', 'REGISTRATION_OPEN'].includes(tournament.status)) {
      res.status(400).json({ error: 'Registration is not open for this tournament' });
      return;
    }
    if (tournament.format === 'INDIVIDUAL') {
      res.status(400).json({ error: 'This tournament does not accept team registrations' });
      return;
    }

    // Roster size validation
    if (tournament.minRosterSize != null && playerUserIds.length < tournament.minRosterSize) {
      res.status(400).json({ error: `At least ${tournament.minRosterSize} players are required` });
      return;
    }
    if (tournament.maxRosterSize != null && playerUserIds.length > tournament.maxRosterSize) {
      res.status(400).json({ error: `At most ${tournament.maxRosterSize} players are allowed` });
      return;
    }

    // Determine coach: if the creator is a COACH user, they are the coach (overrides any passed value).
    const creatorUser = await prisma.user.findUnique({
      where: { id: creatorId },
      select: { role: true },
    });
    const isCreatorACoach = creatorUser?.role === 'COACH';
    const finalCoachId = isCreatorACoach ? creatorId : (coachUserId ?? null);

    // The creator must be either the coach or one of the listed players (anti-abuse).
    const isCreatorPlayer = playerUserIds.includes(creatorId);
    if (!isCreatorACoach && !isCreatorPlayer) {
      res.status(403).json({ error: 'You must be a player on the team or the registering coach' });
      return;
    }

    // Verify all referenced users exist.
    const referencedIds = Array.from(new Set([
      ...playerUserIds,
      ...(finalCoachId ? [finalCoachId] : []),
    ]));
    const foundUsers = await prisma.user.findMany({
      where: { id: { in: referencedIds } },
      select: { id: true, role: true },
    });
    if (foundUsers.length !== referencedIds.length) {
      res.status(400).json({ error: 'One or more selected users were not found' });
      return;
    }
    if (finalCoachId && !isCreatorACoach) {
      const coach = foundUsers.find(u => u.id === finalCoachId);
      if (!coach || coach.role !== 'COACH') {
        res.status(400).json({ error: 'Selected coach does not have a coach profile' });
        return;
      }
    }

    // Optional logo upload — done before the DB transaction (GCS calls can't be transactional).
    let logoUrl: string | null = null;
    if (req.file) {
      if (!validateImageBytes(req.file, res)) return;
      logoUrl = await uploadToGCS(
        req.file.buffer, 'team-logos', extFromFile(req.file), req.file.mimetype,
      );
    }

    // Build member rows. Creator is auto-accepted; everyone else is invited.
    type MemberRow = {
      userId: string;
      role: 'CAPTAIN' | 'PLAYER' | 'COACH';
      status: 'ACCEPTED' | 'PENDING';
      respondedAt: Date | null;
    };
    const now = new Date();
    const memberRows: MemberRow[] = playerUserIds.map((playerId) => ({
      userId: playerId,
      role: playerId === captainUserId ? 'CAPTAIN' : 'PLAYER',
      status: playerId === creatorId ? 'ACCEPTED' : 'PENDING',
      respondedAt: playerId === creatorId ? now : null,
    }));
    if (finalCoachId && !playerUserIds.includes(finalCoachId)) {
      memberRows.push({
        userId: finalCoachId,
        role: 'COACH',
        status: finalCoachId === creatorId ? 'ACCEPTED' : 'PENDING',
        respondedAt: finalCoachId === creatorId ? now : null,
      });
    }

    const { team, registration } = await prisma.$transaction(async (tx) => {
      const team = await tx.team.create({
        data: {
          name: teamName,
          sport: tournament.sport,
          captainId: captainUserId,
          coachId: finalCoachId,
          tournamentId,
          logo: logoUrl,
        },
      });
      await tx.teamMember.createMany({
        data: memberRows.map((m) => ({
          teamId: team.id,
          userId: m.userId,
          role: m.role,
          status: m.status,
          respondedAt: m.respondedAt,
        })),
      });
      const registration = await tx.tournamentTeam.create({
        data: { tournamentId, teamId: team.id },
        include: {
          team: { include: { captain: { select: { id: true, name: true, avatar: true } }, coach: { select: { id: true, name: true, avatar: true } } } },
          tournament: { select: { id: true, name: true } },
        },
      });
      return { team, registration };
    });

    // Fire TEAM_INVITE notifications to all pending invitees.
    const pendingInvitees = memberRows.filter((m) => m.status === 'PENDING').map((m) => m.userId);
    if (pendingInvitees.length > 0) {
      await prisma.notification.createMany({
        data: pendingInvitees.map((userId) => ({
          userId,
          type: 'TEAM_INVITE' as const,
          title: 'Team invitation',
          message: `You've been invited to ${team.name} for ${registration.tournament.name}`,
          referenceId: team.id,
        })),
      });
    }

    res.status(201).json({
      team,
      registration,
      pendingInvites: pendingInvitees.length,
      message: pendingInvitees.length > 0
        ? `Invites sent to ${pendingInvitees.length} member(s). Registration completes once everyone accepts.`
        : 'Registration complete.',
    });
  } catch (error: any) {
    console.error('Register team error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tournaments/:id/registrations — admin: list all registered teams + rosters + invite statuses
router.get('/:id/registrations', authenticate, requireRole('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const tournamentId = req.params.id as string;
    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, name: true, format: true, minRosterSize: true, maxRosterSize: true, sport: true },
    });
    if (!tournament) {
      res.status(404).json({ error: 'Tournament not found' });
      return;
    }

    const registrations = await prisma.tournamentTeam.findMany({
      where: { tournamentId },
      include: {
        team: {
          include: {
            captain: { select: { id: true, name: true, avatar: true } },
            coach:   { select: { id: true, name: true, avatar: true } },
            members: {
              include: { user: { select: { id: true, name: true, avatar: true, position: true } } },
              orderBy: { invitedAt: 'asc' },
            },
          },
        },
      },
      orderBy: { registeredAt: 'desc' },
    });

    const enriched = registrations.map((r) => {
      const total    = r.team.members.length;
      const accepted = r.team.members.filter((m) => m.status === 'ACCEPTED').length;
      const pending  = r.team.members.filter((m) => m.status === 'PENDING').length;
      const declined = r.team.members.filter((m) => m.status === 'DECLINED').length;
      return {
        ...r,
        summary: { total, accepted, pending, declined, isComplete: pending === 0 && declined === 0 },
      };
    });

    res.json({ tournament, registrations: enriched });
  } catch (error) {
    console.error('Get tournament registrations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tournaments/:id/matches — create match (admin)
router.post('/:id/matches', authenticate, requireRole('ADMIN'), validate({ body: CreateMatchBody }), async (req: AuthRequest, res: Response) => {
  try {
    const { homeTeamId, awayTeamId, round, matchDate } = req.body;
    if (!homeTeamId || !awayTeamId || !matchDate) {
      res.status(400).json({ error: 'Home team, away team, and match date are required' });
      return;
    }

    const match = await prisma.match.create({
      data: {
        tournamentId: req.params.id as string,
        homeTeamId,
        awayTeamId,
        round,
        matchDate: new Date(matchDate),
      },
      include: {
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
      },
    });

    res.status(201).json({ match });
  } catch (error) {
    console.error('Create match error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/tournaments/matches/:matchId/result — update match result + stats (admin)
router.put('/matches/:matchId/result', authenticate, requireRole('ADMIN'), validate({ body: MatchResultBody }), async (req: AuthRequest, res: Response) => {
  try {
    const { homeScore, awayScore, playerStats } = req.body;

    const matchId = req.params.matchId as string;

    const matchRecord = await prisma.match.findUnique({
      where: { id: matchId },
      select: { tournamentId: true },
    });

    if (!matchRecord) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }

    const tournamentRecord = await prisma.tournament.findUnique({
      where: { id: matchRecord.tournamentId },
      select: { sport: true },
    });

    if (!tournamentRecord) {
      res.status(404).json({ error: 'Tournament not found' });
      return;
    }

    await prisma.match.update({
      where: { id: matchId },
      data: {
        homeScore: homeScore != null ? parseInt(homeScore) : undefined,
        awayScore: awayScore != null ? parseInt(awayScore) : undefined,
        status: 'COMPLETED',
      },
    });

    // Insert player stats with whitelisted fields to prevent mass assignment
    if (playerStats && Array.isArray(playerStats)) {
      await writeMatchPlayerStats({
        matchId,
        tournamentId: matchRecord.tournamentId,
        sport: tournamentRecord.sport,
        playerStats,
      });
    }

    res.json({ message: 'Match result updated', matchId: req.params.matchId });
  } catch (error) {
    console.error('Update match result error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
