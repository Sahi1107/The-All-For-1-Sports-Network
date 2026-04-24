import { Router, Response } from 'express';
import multer from 'multer';
import prisma from '../config/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { writeLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import { validateImageBytes } from '../middleware/upload';
import { uploadToGCS, signMediaDeep, signMediaDeepAll } from '../services/storage';
import { getIO } from '../config/socket';
import {
  CreateTournamentBody, UpdateTournamentBody, TournamentListQuery,
  RegisterTeamBody, CreateMatchBody, MatchResultBody,
} from '../validation/tournament';

const router = Router();

const thumbnailUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
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
        ageCategory, genderCategory,
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
    const tournament = await prisma.tournament.findUnique({
      where: { id: req.params.id as string },
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
    const { name, status, description, venue, city, prizePool, maxTeams } = req.body;

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
      },
    });

    res.json({ tournament });
  } catch (error) {
    console.error('Update tournament error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tournaments/:id/register — register team
router.post('/:id/register', authenticate, writeLimiter, validate({ body: RegisterTeamBody }), async (req: AuthRequest, res: Response) => {
  try {
    const { teamId } = req.body;
    if (!teamId) {
      res.status(400).json({ error: 'Team ID is required' });
      return;
    }

    // Verify user is captain
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team || team.captainId !== req.user!.userId) {
      res.status(403).json({ error: 'Only team captain can register' });
      return;
    }

    const tournament = await prisma.tournament.findUnique({ where: { id: req.params.id as string } });
    if (!tournament || !['UPCOMING', 'REGISTRATION_OPEN'].includes(tournament.status)) {
      res.status(400).json({ error: 'Registration not available' });
      return;
    }

    const registration = await prisma.tournamentTeam.create({
      data: { tournamentId: req.params.id as string, teamId },
      include: { team: true, tournament: { select: { id: true, name: true } } },
    });

    // Auto-create team chat (Group Chat)
    try {
      const teamMembers = await prisma.teamMember.findMany({
        where: { teamId },
        select: { userId: true },
      });
      // Ensure the captain is included in case they aren't explicitly in TeamMember
      const memberUserIds = new Set(teamMembers.map(m => m.userId));
      memberUserIds.add(team.captainId);
      
      const conv = await prisma.conversation.create({
        data: {
          isGroup: true,
          name: `${team.name} (${registration.tournament.name})`,
          teamId,
          members: {
            create: Array.from(memberUserIds).map(userId => ({ userId })),
          },
        },
        include: {
          members: { include: { user: { select: { id: true, name: true, avatar: true } } } },
        },
      });

      // Emit new conversation event to each member's room
      const io = getIO();
      for (const userId of memberUserIds) {
        try {
          io.to(`user:${userId}`).emit('new_conversation', conv);
        } catch {
           // ignore emit errors 
        }
      }
    } catch (chatError) {
      console.error('Auto-create team chat error:', chatError);
    }

    res.status(201).json({ registration });
  } catch (error: any) {
    if (error.code === 'P2002') {
      res.status(409).json({ error: 'Team already registered' });
      return;
    }
    console.error('Register team error:', error);
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
      const sport = tournamentRecord.sport;
      const base = { matchId, tournamentId: matchRecord.tournamentId };

      for (const stat of playerStats) {
        if (!stat.userId || typeof stat.userId !== 'string') continue;
        const s = stat.stats ?? {};

        if (sport === 'BASKETBALL') {
          await prisma.basketballStats.upsert({
            where: { matchId_userId: { matchId: base.matchId, userId: stat.userId } },
            create: {
              ...base,
              userId: stat.userId,
              points:       Number(s.points       ?? 0),
              rebounds:     Number(s.rebounds      ?? 0),
              assists:      Number(s.assists       ?? 0),
              steals:       Number(s.steals        ?? 0),
              blocks:       Number(s.blocks        ?? 0),
              threePointers:Number(s.threePointers ?? 0),
              freeThrows:   Number(s.freeThrows    ?? 0),
              turnovers:    Number(s.turnovers     ?? 0),
              minutesPlayed:Number(s.minutesPlayed ?? 0),
            },
            update: {
              points:       Number(s.points       ?? 0),
              rebounds:     Number(s.rebounds      ?? 0),
              assists:      Number(s.assists       ?? 0),
              steals:       Number(s.steals        ?? 0),
              blocks:       Number(s.blocks        ?? 0),
              threePointers:Number(s.threePointers ?? 0),
              freeThrows:   Number(s.freeThrows    ?? 0),
              turnovers:    Number(s.turnovers     ?? 0),
              minutesPlayed:Number(s.minutesPlayed ?? 0),
            },
          });
        } else if (sport === 'FOOTBALL') {
          await prisma.footballStats.upsert({
            where: { matchId_userId: { matchId: base.matchId, userId: stat.userId } },
            create: {
              ...base,
              userId: stat.userId,
              goals:        Number(s.goals        ?? 0),
              assists:      Number(s.assists       ?? 0),
              shots:        Number(s.shots         ?? 0),
              passes:       Number(s.passes        ?? 0),
              tackles:      Number(s.tackles       ?? 0),
              saves:        Number(s.saves         ?? 0),
              yellowCards:  Number(s.yellowCards   ?? 0),
              redCards:     Number(s.redCards      ?? 0),
              minutesPlayed:Number(s.minutesPlayed ?? 0),
            },
            update: {
              goals:        Number(s.goals        ?? 0),
              assists:      Number(s.assists       ?? 0),
              shots:        Number(s.shots         ?? 0),
              passes:       Number(s.passes        ?? 0),
              tackles:      Number(s.tackles       ?? 0),
              saves:        Number(s.saves         ?? 0),
              yellowCards:  Number(s.yellowCards   ?? 0),
              redCards:     Number(s.redCards      ?? 0),
              minutesPlayed:Number(s.minutesPlayed ?? 0),
            },
          });
        } else if (sport === 'CRICKET') {
          await prisma.cricketStats.upsert({
            where: { matchId_userId: { matchId: base.matchId, userId: stat.userId } },
            create: {
              ...base,
              userId: stat.userId,
              runs:        Number(s.runs         ?? 0),
              ballsFaced:  Number(s.ballsFaced   ?? 0),
              fours:       Number(s.fours        ?? 0),
              sixes:       Number(s.sixes        ?? 0),
              wickets:     Number(s.wickets      ?? 0),
              oversBowled: Number(s.oversBowled  ?? 0),
              runsConceded:Number(s.runsConceded ?? 0),
              catches:     Number(s.catches      ?? 0),
              runOuts:     Number(s.runOuts      ?? 0),
              strikeRate:  Number(s.strikeRate   ?? 0),
              economy:     Number(s.economy      ?? 0),
            },
            update: {
              runs:        Number(s.runs         ?? 0),
              ballsFaced:  Number(s.ballsFaced   ?? 0),
              fours:       Number(s.fours        ?? 0),
              sixes:       Number(s.sixes        ?? 0),
              wickets:     Number(s.wickets      ?? 0),
              oversBowled: Number(s.oversBowled  ?? 0),
              runsConceded:Number(s.runsConceded ?? 0),
              catches:     Number(s.catches      ?? 0),
              runOuts:     Number(s.runOuts      ?? 0),
              strikeRate:  Number(s.strikeRate   ?? 0),
              economy:     Number(s.economy      ?? 0),
            },
          });
        }
      }
    }

    res.json({ message: 'Match result updated', matchId: req.params.matchId });
  } catch (error) {
    console.error('Update match result error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
