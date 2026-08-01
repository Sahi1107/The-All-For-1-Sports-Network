import { Router, Response } from 'express';
import multer from 'multer';
import prisma from '../config/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { requireTournamentAccess, fromParamId, fromMatchId } from '../middleware/tournamentAccess';
import { writeLimiter } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import { validateImageBytes } from '../middleware/upload';
import { uploadToGCS, signMediaDeep, signMediaDeepAll } from '../services/storage';
import { writeMatchPlayerStats } from '../services/matchStats';
import { notify } from '../services/notifications/notify';
import { isStatSport, CAREER_STAT_FIELDS, type StatSport } from '../data/careerStats';
import { computeStandings } from '../services/trackerDraw';
import { getOrCompute } from '../services/tournamentCache';
import {
  CreateTournamentBody, UpdateTournamentBody, TournamentListQuery,
  RegisterTeamBody, CreateMatchBody, MatchResultBody, ProvisionMemberBody, PlayerSearchQuery,
} from '../validation/tournament';
import { provisionAthleteAccount, ProvisionError } from '../services/provisionAthlete';
import { tournamentPlayerSearchWhere } from '../services/rosterSearch';
import { buildReport, commitBulkProvision, normalizeEmail, tournamentToContext } from '../services/bulkProvision';
import { BulkProvisionBody } from '../validation/admin';

const router = Router();

// Which Prisma stat model holds each stat-sport's per-match rows.
const STAT_MODEL: Record<StatSport, 'basketballStats' | 'footballStats' | 'cricketStats'> = {
  BASKETBALL: 'basketballStats',
  FOOTBALL:   'footballStats',
  CRICKET:    'cricketStats',
};

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
    const { sport, status, search, page = '1', limit = '20' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {};
    if (sport) where.sport = sport;
    if (status) where.status = status;
    if (search) where.name = { contains: search as string, mode: 'insensitive' };

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

// GET /api/tournaments/mine/organizing — tournaments the requester organises.
// Powers the organiser's landing (route straight to their tournament) and any
// "my tournaments" view. Empty for users with no organiser assignments.
router.get('/mine/organizing', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const rows = await prisma.tournamentOrganizer.findMany({
      where: { userId: req.user!.userId },
      select: {
        tournament: {
          select: { id: true, name: true, sport: true, status: true, startDate: true, city: true, venue: true, thumbnailUrl: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ tournaments: rows.map((r) => r.tournament) });
  } catch (error) {
    console.error('Get organizing tournaments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tournaments/:id
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const tournamentId = req.params.id as string;
    const userId = req.user!.userId;

    // Shared, viewer-independent base — cached + single-flighted. myTeams (per-viewer) stays fresh below.
    const tournament = await getOrCompute(tournamentId, 'base', async () => {
      const t = await prisma.tournament.findUnique({
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
      if (!t) return null;
      await signMediaDeep(t);
      return t;
    }) as any;

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

    // Per-viewer management signal for the manage page: a platform ADMIN, or an
    // organiser assigned to THIS tournament. Purely advisory for the UI — every
    // management endpoint is still enforced server-side by requireTournamentAccess.
    const viewerCanManage =
      req.user!.role === 'ADMIN' ||
      Boolean(await prisma.tournamentOrganizer.findUnique({
        where: { tournamentId_userId: { tournamentId, userId } },
        select: { id: true },
      }));

    // Spread so the per-viewer myTeams is never written back into the shared cache entry.
    res.json({ tournament: { ...tournament, myTeams, viewerCanManage } });
  } catch (error) {
    console.error('Get tournament error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tournaments/:id/teams — rosters + per-player per-match & per-tournament stats
// Viewable by all authenticated users (the Teams tab). Stats are only populated for
// the three stat sports (Football / Basketball / Cricket); other sports return rosters
// with null stats.
router.get('/:id/teams', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const tournamentId = req.params.id as string;

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, sport: true },
    });
    if (!tournament) {
      res.status(404).json({ error: 'Tournament not found' });
      return;
    }

    // Heavy roster + stat aggregation — cached + single-flighted (viewer-independent).
    const payload = await getOrCompute(tournamentId, 'teams', async () => {

    // Rosters: registered teams → accepted members → user profile fields.
    const registrations = await prisma.tournamentTeam.findMany({
      where: { tournamentId },
      include: {
        team: {
          include: {
            members: {
              where: { status: 'ACCEPTED' },
              include: { user: { select: { id: true, name: true, position: true, age: true, avatar: true } } },
              orderBy: { invitedAt: 'asc' },
            },
          },
        },
      },
      orderBy: { registeredAt: 'asc' },
    });

    // Matches (for per-match context: opponent + result).
    const matchRows = await prisma.match.findMany({
      where: { tournamentId },
      include: {
        homeTeam: { select: { id: true, name: true } },
        awayTeam: { select: { id: true, name: true } },
      },
      orderBy: { matchDate: 'asc' },
    });
    const matches = matchRows.map((m) => ({
      id: m.id,
      round: m.round,
      date: m.matchDate,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      homeTeamName: m.homeTeam?.name ?? null,
      awayTeamName: m.awayTeam?.name ?? null,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
    }));

    const statSport = isStatSport(tournament.sport);
    const fields = statSport ? CAREER_STAT_FIELDS[tournament.sport as StatSport] : [];

    // Aggregate stats once for the whole tournament, then attach per player.
    const totalsByUser = new Map<string, { matches: number; totals: Record<string, number> }>();
    const perMatchByUser = new Map<string, Array<Record<string, unknown>>>();
    if (statSport) {
      const model = (prisma as any)[STAT_MODEL[tournament.sport as StatSport]];
      const grouped = await model.groupBy({
        by: ['userId'],
        where: { tournamentId },
        _sum: Object.fromEntries(fields.map((f) => [f, true])),
        _count: { _all: true },
      });
      for (const g of grouped as Array<{ userId: string; _sum: Record<string, number | null>; _count: { _all: number } }>) {
        const totals: Record<string, number> = {};
        for (const f of fields) totals[f] = Number(g._sum[f] ?? 0);
        totalsByUser.set(g.userId, { matches: g._count._all, totals });
      }
      const rows = await model.findMany({
        where: { tournamentId },
        select: { matchId: true, userId: true, ...Object.fromEntries(fields.map((f) => [f, true])) },
      });
      for (const r of rows as Array<Record<string, any>>) {
        const arr = perMatchByUser.get(r.userId) ?? [];
        const line: Record<string, unknown> = { matchId: r.matchId };
        for (const f of fields) line[f] = Number(r[f] ?? 0);
        arr.push(line);
        perMatchByUser.set(r.userId, arr);
      }
    }

    const teams = registrations.map((r) => ({
      id: r.team.id,
      name: r.team.name,
      logo: r.team.logo,
      captainId: r.team.captainId,
      players: r.team.members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        position: m.user.position,
        age: m.user.age,
        avatar: m.user.avatar,
        role: m.role,
        isCaptain: m.role === 'CAPTAIN' || r.team.captainId === m.user.id,
        totals: totalsByUser.get(m.user.id) ?? null,
        perMatch: perMatchByUser.get(m.user.id) ?? [],
      })),
    }));

    // Sign avatars/logos (real GCS media; external test URLs pass through untouched).
    // signMediaDeep only descends specific keys, so sign the team logos and the
    // player avatars as flat lists.
    await signMediaDeepAll(teams);
    await signMediaDeepAll(teams.flatMap((t) => t.players));

      return { sport: tournament.sport, isStatSport: statSport, statFields: fields, matches, teams };
    });
    res.json(payload);
  } catch (error) {
    console.error('Get tournament teams error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tournaments/:id/fixtures — group standings + knockout bracket (all users).
// Reads the TrackerSession (groups/bracket JSON) + its TrackerMatch rows. When no
// session exists, falls back to the flat platform Match list so the tab never dead-ends.
const STAGE_RANK: Record<string, number> = { r32: 0, r16: 1, qf: 2, sf: 3, final: 4, third_place: 5 };
const STAGE_TITLE: Record<string, string> = {
  r32: 'Round of 32', r16: 'Round of 16', qf: 'Quarter-finals',
  sf: 'Semi-finals', final: 'Final', third_place: 'Third place',
};

router.get('/:id/fixtures', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const tournamentId = req.params.id as string;

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, sport: true },
    });
    if (!tournament) {
      res.status(404).json({ error: 'Tournament not found' });
      return;
    }

    // Group standings + bracket build — cached + single-flighted (viewer-independent).
    const payload = await getOrCompute(tournamentId, 'fixtures', async () => {

    // Team lookup (name + logo) for every registered team.
    const regs = await prisma.tournamentTeam.findMany({
      where: { tournamentId },
      include: { team: { select: { id: true, name: true, logo: true } } },
    });
    const teamList = regs.map((r) => ({ id: r.team.id, name: r.team.name, logo: r.team.logo }));
    await signMediaDeepAll(teamList);
    const teams: Record<string, { id: string; name: string; logo: string | null }> =
      Object.fromEntries(teamList.map((t) => [t.id, t]));

    const session = await prisma.trackerSession.findUnique({
      where: { tournamentId },
      include: { matches: { orderBy: { orderIndex: 'asc' } } },
    });

    const lite = (m: any) => ({
      id: m.id, stage: m.stage, round: m.round, groupId: m.groupId,
      bracketSlot: m.bracketSlot, feedsInto: m.feedsInto,
      homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId,
      homeScore: m.homeScore, awayScore: m.awayScore, status: m.status,
      scheduledAt: m.scheduledAt ?? null, court: m.court ?? null,
      statsMatchId: m.publishedMatchId ?? null, // platform Match id for the box score
      winnerTeamId:
        (m.status === 'COMPLETED' || m.status === 'PUBLISHED') && m.homeTeamId && m.awayTeamId && m.homeScore !== m.awayScore
          ? (m.homeScore > m.awayScore ? m.homeTeamId : m.awayTeamId)
          : null,
    });

    if (!session) {
      // Fallback: flat platform match list (may be empty → client shows "not published yet").
      const flatRows = await prisma.match.findMany({
        where: { tournamentId },
        orderBy: { matchDate: 'asc' },
        select: { id: true, round: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, status: true, matchDate: true, court: true },
      });
      const flat = flatRows.map((m) => ({ ...m, scheduledAt: m.matchDate, court: m.court ?? null, statsMatchId: m.id }));
      return { hasBracket: false, format: null, teams, groups: null, bracket: null, flatMatches: flat };
    }

    const allMatches = session.matches as any[];
    const groupDefs: Array<{ id: string; name: string; teamIds: string[] }> = (session.groups as any) ?? [];

    // Group stage: standings + fixtures per group.
    const groups = groupDefs.map((g) => {
      const gMatches = allMatches.filter((m) => (m.stage === 'group' || m.stage === 'league') && m.groupId === g.id);
      const standings = computeStandings(
        g.teamIds,
        gMatches.map((m) => ({ homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId, homeScore: m.homeScore, awayScore: m.awayScore, status: m.status })),
      );
      return { id: g.id, name: g.name, teamIds: g.teamIds, standings, matches: gMatches.map(lite) };
    });

    // Knockout bracket: group non-group matches by stage, ordered.
    const koMatches = allMatches.filter((m) => m.stage !== 'group' && m.stage !== 'league');
    const byStage = new Map<string, any[]>();
    for (const m of koMatches) {
      const arr = byStage.get(m.stage) ?? [];
      arr.push(m);
      byStage.set(m.stage, arr);
    }
    const orderedStages = [...byStage.keys()].sort((a, b) => (STAGE_RANK[a] ?? 99) - (STAGE_RANK[b] ?? 99));
    // Order slots within a stage by the numeric suffix of bracketSlot ("qf-1".."qf-10")
    // so a 10+ slot round doesn't misorder; fall back to orderIndex.
    const slotOrder = (m: any): number => {
      const match = String(m.bracketSlot ?? '').match(/(\d+)\s*$/);
      return match ? parseInt(match[1], 10) : m.orderIndex;
    };
    const rounds = orderedStages
      .filter((s) => s !== 'third_place')
      .map((s) => ({
        stage: s,
        title: STAGE_TITLE[s] ?? s,
        matches: (byStage.get(s) ?? [])
          .sort((a, b) => slotOrder(a) - slotOrder(b) || a.orderIndex - b.orderIndex)
          .map(lite),
      }));
    const thirdPlaceArr = byStage.get('third_place') ?? [];
    const bracket = rounds.length > 0 || thirdPlaceArr.length > 0
      ? { rounds, thirdPlace: thirdPlaceArr.length > 0 ? lite(thirdPlaceArr[0]) : null }
      : null;

    // Teams that reached the knockout (earliest bracket round) — for the "qualified" highlight.
    const advancingTeamIds = rounds.length > 0
      ? Array.from(new Set(rounds[0].matches.flatMap((m) => [m.homeTeamId, m.awayTeamId]).filter(Boolean)))
      : [];

    return {
      hasBracket: true,
      format: session.format,
      teams,
      groups: groups.length > 0 ? groups : null,
      bracket,
      advancingTeamIds,
      flatMatches: null,
    };
    });
    res.json(payload);
  } catch (error) {
    console.error('Get tournament fixtures error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tournaments/:id/leaders — tournament stat leaders from PUBLISHED DB stats.
// All-users. Sibling of /teams + /fixtures. Same LeaderCategory shape the shared
// StatLeaders card renders, so admin (live-else-DB) and public share one component.
const LEADER_CATS: Record<StatSport, { key: string; label: string; fields: string[] }[]> = {
  FOOTBALL: [
    { key: 'goals',   label: 'Top scorers',        fields: ['goals'] },
    { key: 'assists', label: 'Assists',            fields: ['assists'] },
    { key: 'ga',      label: 'Goal contributions', fields: ['goals', 'assists'] },
    { key: 'shots',   label: 'Shots',              fields: ['shots'] },
    { key: 'passes',  label: 'Passes',             fields: ['passes'] },
    { key: 'tackles', label: 'Tackles',            fields: ['tackles'] },
    { key: 'saves',   label: 'Goalkeeper saves',   fields: ['saves'] },
  ],
  BASKETBALL: [
    { key: 'points',        label: 'Points',         fields: ['points'] },
    { key: 'rebounds',      label: 'Rebounds',       fields: ['rebounds'] },
    { key: 'assists',       label: 'Assists',        fields: ['assists'] },
    { key: 'steals',        label: 'Steals',         fields: ['steals'] },
    { key: 'blocks',        label: 'Blocks',         fields: ['blocks'] },
    { key: 'threePointers', label: 'Three-pointers', fields: ['threePointers'] },
    { key: 'freeThrows',    label: 'Free throws',    fields: ['freeThrows'] },
  ],
  CRICKET: [
    { key: 'runs',    label: 'Runs',    fields: ['runs'] },
    { key: 'wickets', label: 'Wickets', fields: ['wickets'] },
    { key: 'fours',   label: 'Fours',   fields: ['fours'] },
    { key: 'sixes',   label: 'Sixes',   fields: ['sixes'] },
    { key: 'catches', label: 'Catches', fields: ['catches'] },
  ],
};

router.get('/:id/leaders', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const tournamentId = req.params.id as string;

    const tournament = await prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true, sport: true },
    });
    if (!tournament) {
      res.status(404).json({ error: 'Tournament not found' });
      return;
    }

    // Stat leaderboard aggregation — cached + single-flighted (viewer-independent).
    const payload = await getOrCompute(tournamentId, 'leaders', async () => {
    if (!isStatSport(tournament.sport)) {
      return { sport: tournament.sport, categories: [] };
    }

    const sport = tournament.sport as StatSport;
    const cats = LEADER_CATS[sport];
    const sumFields = Array.from(new Set(cats.flatMap((c) => c.fields)));

    const model = (prisma as any)[STAT_MODEL[sport]];
    const grouped = await model.groupBy({
      by: ['userId'],
      where: { tournamentId },
      _sum: Object.fromEntries(sumFields.map((f) => [f, true])),
    });
    const sums = (grouped as Array<{ userId: string; _sum: Record<string, number | null> }>).map((g) => ({
      userId: g.userId,
      vals: Object.fromEntries(sumFields.map((f) => [f, Number(g._sum[f] ?? 0)])),
    }));

    // name + teamName per player, from the tournament's rosters (+ direct lookup fallback).
    const regs = await prisma.tournamentTeam.findMany({
      where: { tournamentId },
      include: {
        team: {
          select: {
            name: true,
            members: { where: { status: 'ACCEPTED' }, select: { userId: true, user: { select: { name: true } } } },
          },
        },
      },
    });
    const meta = new Map<string, { name: string; teamName: string }>();
    regs.forEach((r) => r.team.members.forEach((m) => {
      if (!meta.has(m.userId)) meta.set(m.userId, { name: m.user.name, teamName: r.team.name });
    }));
    const missing = sums.map((s) => s.userId).filter((id) => !meta.has(id));
    if (missing.length > 0) {
      const users = await prisma.user.findMany({ where: { id: { in: missing } }, select: { id: true, name: true } });
      users.forEach((u) => meta.set(u.id, { name: u.name, teamName: '' }));
    }

    const categories = cats
      .map((c) => ({
        key: c.key,
        label: c.label,
        rows: sums
          .map((s) => ({
            userId: s.userId,
            name: meta.get(s.userId)?.name ?? 'Unknown',
            teamName: meta.get(s.userId)?.teamName ?? '',
            value: c.fields.reduce((t, f) => t + (s.vals[f] ?? 0), 0),
          }))
          .filter((r) => r.value > 0)
          .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
          .slice(0, 10),
      }))
      .filter((c) => c.rows.length > 0);

    return { sport: tournament.sport, categories };
    });
    res.json(payload);
  } catch (error) {
    console.error('Get tournament leaders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tournaments/matches/:matchId/stats — per-player stats for ONE published
// match, from the DB stat tables. Shaped to match the client's footballPlayerRows /
// basketballPlayerRows output so MatchDetails renders live-state and DB rows the same.
router.get('/matches/:matchId/stats', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const matchId = req.params.matchId as string;
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      select: { id: true, tournamentId: true, tournament: { select: { sport: true } } },
    });
    if (!match) {
      res.status(404).json({ error: 'Match not found' });
      return;
    }
    const sport = match.tournament.sport;
    if (!isStatSport(sport)) {
      res.json({ sport, rows: [] });
      return;
    }

    // userId -> teamName (from the tournament's accepted rosters).
    const regs = await prisma.tournamentTeam.findMany({
      where: { tournamentId: match.tournamentId },
      include: { team: { select: { name: true, members: { where: { status: 'ACCEPTED' }, select: { userId: true } } } } },
    });
    const teamByUser = new Map<string, string>();
    regs.forEach((r) => r.team.members.forEach((m) => { if (!teamByUser.has(m.userId)) teamByUser.set(m.userId, r.team.name); }));

    const model = (prisma as any)[STAT_MODEL[sport as StatSport]];
    const statRows = await model.findMany({
      where: { matchId },
      include: { user: { select: { name: true } } },
    });

    let rows: any[];
    if (sport === 'FOOTBALL') {
      rows = statRows.map((s: any) => ({
        userId: s.userId, name: s.user?.name ?? 'Player', teamName: teamByUser.get(s.userId) ?? '',
        goals: s.goals, assists: s.assists, shots: s.shots, shotsOnTarget: 0,
        saves: s.saves, tackles: s.tackles, passC: s.passes, passI: 0,
        yellow: s.yellowCards, red: s.redCards, minutes: Math.round(s.minutesPlayed),
      })).sort((a: any, b: any) => b.goals - a.goals || b.assists - a.assists);
    } else if (sport === 'BASKETBALL') {
      rows = statRows.map((s: any) => ({
        userId: s.userId, name: s.user?.name ?? 'Player', teamName: teamByUser.get(s.userId) ?? '',
        min: Math.round(s.minutesPlayed), pts: s.points, ast: s.assists,
        reb: s.rebounds, oreb: s.offRebounds, dreb: s.defRebounds,
        stl: s.steals, blk: s.blocks, tp2: s.twoPointers, tp: s.threePointers,
        ft: s.freeThrows, to: s.turnovers, pf: s.personalFouls,
      })).sort((a: any, b: any) => b.pts - a.pts);
    } else {
      rows = statRows.map((s: any) => ({ userId: s.userId, name: s.user?.name ?? 'Player', teamName: teamByUser.get(s.userId) ?? '', ...s }));
    }

    res.json({ sport, rows });
  } catch (error) {
    console.error('Get match stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Allowed tournament lifecycle transitions (admin-driven). Forward flow plus a
// one-step-back / cancel escape hatch so mistakes are correctable. Enforced only
// when `status` actually changes; other field edits are unaffected.
const STATUS_TRANSITIONS: Record<string, string[]> = {
  UPCOMING:            ['REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'CANCELLED'],
  REGISTRATION_OPEN:   ['REGISTRATION_CLOSED', 'UPCOMING', 'CANCELLED'],
  REGISTRATION_CLOSED: ['IN_PROGRESS', 'REGISTRATION_OPEN', 'CANCELLED'],
  IN_PROGRESS:         ['COMPLETED', 'REGISTRATION_CLOSED', 'CANCELLED'],
  COMPLETED:           ['IN_PROGRESS'],
  CANCELLED:           ['UPCOMING'],
};

// PUT /api/tournaments/:id — update (admin only)
router.put('/:id', authenticate, requireTournamentAccess(fromParamId), validate({ body: UpdateTournamentBody }), async (req: AuthRequest, res: Response) => {
  try {
    const {
      name, status, description, venue, city, prizePool, maxTeams, minRosterSize, maxRosterSize,
      startDate, endDate, entryFee, category, ageCategory, genderCategory,
    } = req.body;
    const id = req.params.id as string;

    // Validate lifecycle transitions when the status is being changed.
    if (status) {
      const current = await prisma.tournament.findUnique({ where: { id }, select: { status: true } });
      if (!current) {
        res.status(404).json({ error: 'Tournament not found' });
        return;
      }
      if (status !== current.status && !(STATUS_TRANSITIONS[current.status] ?? []).includes(status)) {
        res.status(400).json({ error: `Cannot move a ${current.status.replace(/_/g, ' ').toLowerCase()} tournament to ${status.replace(/_/g, ' ').toLowerCase()}` });
        return;
      }
    }

    const tournament = await prisma.tournament.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(status && { status }),
        ...(description !== undefined && { description }),
        ...(venue !== undefined && { venue }),
        ...(city !== undefined && { city }),
        ...(prizePool !== undefined && { prizePool: parseFloat(prizePool) }),
        ...(entryFee !== undefined && { entryFee: parseFloat(entryFee) }),
        ...(maxTeams !== undefined && { maxTeams: parseInt(maxTeams) }),
        ...(minRosterSize !== undefined && { minRosterSize: parseInt(minRosterSize) }),
        ...(maxRosterSize !== undefined && { maxRosterSize: parseInt(maxRosterSize) }),
        ...(startDate !== undefined && { startDate }),
        ...(endDate !== undefined && { endDate }),
        ...(category !== undefined && { category }),
        ...(ageCategory !== undefined && { ageCategory }),
        ...(genderCategory !== undefined && { genderCategory }),
      },
    });

    res.json({ tournament });
  } catch (error) {
    console.error('Update tournament error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/tournaments/:id/thumbnail — update just the logo/thumbnail.
// Separate from PUT /:id because a JSON body can't carry a file. Scoped to the
// tournament's organiser (requireTournamentAccess) — never platform-wide.
router.patch('/:id/thumbnail', authenticate, requireTournamentAccess(fromParamId), writeLimiter, thumbnailUpload.single('thumbnail'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) { res.status(400).json({ error: 'No image provided' }); return; }
    if (!validateImageBytes(req.file, res)) return; // sends its own 400 on bad bytes
    const thumbnailUrl = await uploadToGCS(req.file.buffer, 'tournaments', extFromFile(req.file), req.file.mimetype);
    const tournament = await prisma.tournament.update({
      where: { id: req.params.id as string },
      data: { thumbnailUrl },
    });
    await signMediaDeep(tournament);
    res.json({ tournament });
  } catch (error) {
    console.error('Update tournament thumbnail error:', error);
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
      await Promise.all(pendingInvitees.map((userId) => notify({
        recipientId: userId,
        type: 'TEAM_INVITE',
        actorId: req.user!.userId,
        ctx: { entityName: team.name },
        referenceId: team.id,
        link: `/teams/${team.id}`,
      })));
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
router.get('/:id/registrations', authenticate, requireTournamentAccess(fromParamId), async (req: AuthRequest, res: Response) => {
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

// ─── Admin roster editing ───────────────────────────────────────────────────
// POST /api/tournaments/:id/teams — admin: create a team with an all-ACCEPTED
// roster (manual late entry, no CSV/self-serve accept dance).
router.post('/:id/teams', authenticate, requireTournamentAccess(fromParamId), writeLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const tournamentId = req.params.id as string;
    const { teamName, captainUserId, playerUserIds, coachUserId } = req.body as {
      teamName?: string; captainUserId?: string; playerUserIds?: string[]; coachUserId?: string;
    };
    if (!teamName?.trim() || !captainUserId || !Array.isArray(playerUserIds) || playerUserIds.length === 0) {
      res.status(400).json({ error: 'Team name, captain and at least one player are required' });
      return;
    }
    if (!playerUserIds.includes(captainUserId)) {
      res.status(400).json({ error: 'The captain must be one of the players' });
      return;
    }
    const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { id: true, sport: true } });
    if (!tournament) { res.status(404).json({ error: 'Tournament not found' }); return; }

    const ids = Array.from(new Set([...playerUserIds, ...(coachUserId ? [coachUserId] : [])]));
    const found = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true } });
    if (found.length !== ids.length) { res.status(400).json({ error: 'One or more selected users were not found' }); return; }

    const now = new Date();
    const team = await prisma.$transaction(async (tx) => {
      const team = await tx.team.create({
        data: { name: teamName.trim(), sport: tournament.sport, captainId: captainUserId, coachId: coachUserId ?? null, tournamentId },
      });
      await tx.teamMember.createMany({
        data: playerUserIds.map((uid) => ({
          teamId: team.id, userId: uid, role: uid === captainUserId ? 'CAPTAIN' as const : 'PLAYER' as const,
          status: 'ACCEPTED' as const, respondedAt: now,
        })),
      });
      if (coachUserId && !playerUserIds.includes(coachUserId)) {
        await tx.teamMember.create({ data: { teamId: team.id, userId: coachUserId, role: 'COACH', status: 'ACCEPTED', respondedAt: now } });
      }
      await tx.tournamentTeam.create({ data: { tournamentId, teamId: team.id } });
      return team;
    });
    res.status(201).json({ team });
  } catch (error) {
    console.error('Admin create team error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tournaments/:id/player-search?q= — organiser roster "add existing".
// Gated by requireTournamentAccess (organiser for THIS tournament, or admin).
// Returns players matching the name that are either already ON A TEAM IN THIS
// TOURNAMENT or an admin/organiser-provisioned profile that hasn't signed in yet
// (so freshly imported players are addable before they log in) — bypassing the
// public discovery gate but staying bounded so it can't enumerate real private
// accounts outside this tournament (see services/rosterSearch).
router.get('/:id/player-search', authenticate, requireTournamentAccess(fromParamId), validate({ query: PlayerSearchQuery }), async (req: AuthRequest, res: Response) => {
  try {
    const q = (req.query.q as string) ?? '';
    if (q.length < 2) { res.json({ players: [] }); return; }
    const players = await prisma.user.findMany({
      where: tournamentPlayerSearchWhere(req.params.id as string, q),
      select: { id: true, name: true, position: true, avatar: true },
      take: 12,
      orderBy: { name: 'asc' },
    });
    await signMediaDeepAll(players);
    res.json({ players });
  } catch (error) {
    console.error('Roster player search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Load the fields the bulk provisioner needs for THIS tournament.
async function bulkTournamentContext(id: string) {
  return prisma.tournament.findUnique({
    where: { id },
    select: { id: true, name: true, sport: true, genderCategory: true, minRosterSize: true, maxRosterSize: true },
  });
}

// POST /api/tournaments/:id/bulk-provision/preview — organiser CSV import (SCOPED).
// Same pipeline + minor-safety as the admin bulk import, but gated to the assigned
// organiser of THIS tournament (requireTournamentAccess) — never platform-wide.
router.post('/:id/bulk-provision/preview', authenticate, requireTournamentAccess(fromParamId), writeLimiter, validate({ body: BulkProvisionBody }), async (req: AuthRequest, res: Response) => {
  try {
    const t = await bulkTournamentContext(req.params.id as string);
    if (!t) { res.status(404).json({ error: 'Tournament not found' }); return; }
    const rows = req.body.rows as any[];
    const emails = [...new Set(rows.map((r) => normalizeEmail(r.email)).filter(Boolean))];
    const existing = await prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true } });
    const { report } = buildReport(rows, tournamentToContext(t), new Set(existing.map((u) => u.email)));
    res.json({ report });
  } catch (error) {
    console.error('Organiser bulk-provision preview error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tournaments/:id/bulk-provision/commit — organiser CSV import commit (SCOPED).
router.post('/:id/bulk-provision/commit', authenticate, requireTournamentAccess(fromParamId), writeLimiter, validate({ body: BulkProvisionBody }), async (req: AuthRequest, res: Response) => {
  try {
    const t = await bulkTournamentContext(req.params.id as string);
    if (!t) { res.status(404).json({ error: 'Tournament not found' }); return; }
    const result = await commitBulkProvision(req.body.rows as any[], tournamentToContext(t));
    res.json({ result });
  } catch (error: any) {
    if (error?.status === 422 && error?.blocking) {
      res.status(422).json({ error: 'Bulk provision blocked by validation errors', blockingErrors: error.blocking });
      return;
    }
    console.error('Organiser bulk-provision commit error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tournaments/:id/teams/:teamId/members — admin: add a member (ACCEPTED).
router.post('/:id/teams/:teamId/members', authenticate, requireTournamentAccess(fromParamId), writeLimiter, async (req: AuthRequest, res: Response) => {
  try {
    const { userId, role } = req.body as { userId?: string; role?: string };
    if (!userId) { res.status(400).json({ error: 'userId is required' }); return; }
    const team = await prisma.team.findFirst({ where: { id: req.params.teamId as string, tournamentId: req.params.id as string } });
    if (!team) { res.status(404).json({ error: 'Team not found in this tournament' }); return; }
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) { res.status(400).json({ error: 'User not found' }); return; }
    await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: team.id, userId } },
      create: { teamId: team.id, userId, role: role === 'COACH' ? 'COACH' : 'PLAYER', status: 'ACCEPTED', respondedAt: new Date() },
      update: { status: 'ACCEPTED', respondedAt: new Date() },
    });
    res.json({ ok: true });
  } catch (error) {
    console.error('Admin add member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tournaments/:id/teams/:teamId/members/provision — create a NEW player
// account and add them to the team directly (all-accepted). For organisers running
// a live tournament where most players aren't on the platform yet.
//
// Tournament-SCOPED (requireTournamentAccess): the team must belong to THIS
// tournament and the sport is taken from the tournament — this is not a path to
// platform-wide user creation or bulk provisioning. Account creation (DOB / under-13
// guardian consent / private-by-default / duplicate-email linking) is delegated to
// provisionAthleteAccount, so every safeguard that applies to admin creation applies
// here too. An existing account (by email) is linked and added, never recreated.
router.post(
  '/:id/teams/:teamId/members/provision',
  authenticate,
  requireTournamentAccess(fromParamId),
  writeLimiter,
  validate({ body: ProvisionMemberBody }),
  async (req: AuthRequest, res: Response) => {
    try {
      const tournamentId = req.params.id as string;
      const team = await prisma.team.findFirst({
        where: { id: req.params.teamId as string, tournamentId },
        select: { id: true },
      });
      if (!team) { res.status(404).json({ error: 'Team not found in this tournament' }); return; }

      const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { sport: true } });
      if (!tournament) { res.status(404).json({ error: 'Tournament not found' }); return; }

      const b = req.body;
      // Sport is the tournament's, never client-supplied — keeps this scoped.
      const result = await provisionAthleteAccount({
        name: b.name,
        email: b.email,
        role: b.role,
        sport: tournament.sport,
        dateOfBirth: new Date(b.dateOfBirth),
        gender: b.gender,
        position: b.position,
        phone: b.phone,
        guardianEmail: b.guardianEmail,
        allowDuplicate: b.allowDuplicate,
      });

      await prisma.teamMember.upsert({
        where: { teamId_userId: { teamId: team.id, userId: result.userId } },
        create: { teamId: team.id, userId: result.userId, role: b.role === 'COACH' ? 'COACH' : 'PLAYER', status: 'ACCEPTED', respondedAt: new Date() },
        update: { status: 'ACCEPTED', respondedAt: new Date() },
      });

      res.status(201).json({
        userId: result.userId,
        created: result.created,
        guardianConsentPending: result.guardianConsentPending,
      });
    } catch (error) {
      if (error instanceof ProvisionError) {
        const status = error.code === 'DUPLICATE_WARNING' ? 409 : 400;
        res.status(status).json({ error: error.message, code: error.code, ...(error.data as Record<string, unknown> ?? {}) });
        return;
      }
      console.error('Provision team member error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// DELETE /api/tournaments/:id/teams/:teamId/members/:userId — admin: remove a member.
router.delete('/:id/teams/:teamId/members/:userId', authenticate, requireTournamentAccess(fromParamId), async (req: AuthRequest, res: Response) => {
  try {
    const team = await prisma.team.findFirst({ where: { id: req.params.teamId as string, tournamentId: req.params.id as string } });
    if (!team) { res.status(404).json({ error: 'Team not found in this tournament' }); return; }
    if (team.captainId === req.params.userId) {
      res.status(400).json({ error: 'Reassign the captain before removing them' });
      return;
    }
    await prisma.teamMember.deleteMany({ where: { teamId: team.id, userId: req.params.userId as string } });
    res.json({ ok: true });
  } catch (error) {
    console.error('Admin remove member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/tournaments/:id/matches — create match (admin)
router.post('/:id/matches', authenticate, requireTournamentAccess(fromParamId), validate({ body: CreateMatchBody }), async (req: AuthRequest, res: Response) => {
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
router.put('/matches/:matchId/result', authenticate, requireTournamentAccess(fromMatchId), validate({ body: MatchResultBody }), async (req: AuthRequest, res: Response) => {
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
