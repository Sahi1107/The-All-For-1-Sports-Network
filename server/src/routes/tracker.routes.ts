import { Router, Response } from 'express';
import prisma from '../config/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { validate } from '../middleware/validate';
import { getIO } from '../config/socket';
import {
  generateDraw,
  computeStandings,
  seedOrderFromGroups,
  bracketWinner,
  bracketLoser,
  type BracketDef,
  type GroupDef,
} from '../services/trackerDraw';
import { derivePlayerStats } from '../services/trackerStats';
import { writeMatchPlayerStats } from '../services/matchStats';
import {
  CreateSessionBody,
  PatchMatchBody,
  IdParam,
  TournamentIdParam,
} from '../validation/tracker';

const router = Router();
router.use(authenticate, requireRole('ADMIN'));

type TrackerMatchRow = {
  id: string;
  sessionId: string;
  stage: string;
  bracketSlot: string | null;
  feedsInto: string | null;
  groupId: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number;
  awayScore: number;
  status: string;
};

// ─── Bracket propagation helpers ─────────────────────────────

/** After a knockout match completes, push the winner (or loser for 3rd place)
 *  into the match it feeds. */
async function propagateBracket(
  sessionId: string,
  bracket: BracketDef | null,
  completed: TrackerMatchRow,
) {
  if (!bracket || !completed.bracketSlot || !completed.feedsInto) return;
  const targetSlot = bracket.slots.find((s) => s.id === completed.feedsInto);
  if (!targetSlot) return;
  const targetMatch = await prisma.trackerMatch.findFirst({
    where: { sessionId, bracketSlot: targetSlot.id },
  });
  if (!targetMatch) return;

  const team =
    targetSlot.stage === 'third_place' ? bracketLoser(completed) : bracketWinner(completed);
  if (!team) return;

  const feederA = targetSlot.feedFrom?.[0];
  const side = completed.bracketSlot === feederA ? 'home' : 'away';
  await prisma.trackerMatch.update({
    where: { id: targetMatch.id },
    data: side === 'home' ? { homeTeamId: team } : { awayTeamId: team },
  });
}

/** For MIXED sessions: once every group match is finished, seed the first
 *  knockout round from group standings. No-op if already seeded or incomplete. */
async function maybeSeedKnockout(session: {
  id: string;
  groups: unknown;
  bracket: unknown;
  config: unknown;
}) {
  const groups = (session.groups as GroupDef[] | null) ?? [];
  const bracket = session.bracket as BracketDef | null;
  if (!groups.length || !bracket || !bracket.stages.length) return;

  const matches = await prisma.trackerMatch.findMany({ where: { sessionId: session.id } });
  const groupMatches = matches.filter((m) => m.stage === 'group');
  if (!groupMatches.length) return;
  const allGroupsDone = groupMatches.every(
    (m) => m.status === 'COMPLETED' || m.status === 'PUBLISHED',
  );
  if (!allGroupsDone) return;

  const firstStage = bracket.stages[0];
  const firstSlots = bracket.slots.filter((s) => s.stage === firstStage);
  const firstRoundMatches = matches.filter((m) => m.bracketSlot && firstSlots.some((s) => s.id === m.bracketSlot));
  // Already seeded?
  if (firstRoundMatches.some((m) => m.homeTeamId || m.awayTeamId)) return;

  const advancePerGroup = (session.config as { advancePerGroup?: number } | null)?.advancePerGroup ?? 2;
  const standings = computeStandings(
    groups.flatMap((g) => g.teamIds),
    groupMatches,
  );
  const order = seedOrderFromGroups(groups, standings, advancePerGroup);

  for (let i = 0; i < firstSlots.length; i++) {
    const slot = firstSlots[i];
    const match = matches.find((m) => m.bracketSlot === slot.id);
    if (!match) continue;
    await prisma.trackerMatch.update({
      where: { id: match.id },
      data: { homeTeamId: order[i * 2] ?? null, awayTeamId: order[i * 2 + 1] ?? null },
    });
  }
}

// ─── GET session for a tournament ────────────────────────────
router.get(
  '/sessions/:tournamentId',
  validate({ params: TournamentIdParam }),
  async (req: AuthRequest, res: Response) => {
    try {
      const session = await prisma.trackerSession.findUnique({
        where: { tournamentId: req.params.tournamentId as string },
        include: { matches: { orderBy: { orderIndex: 'asc' } } },
      });
      res.json({ session });
    } catch (err) {
      console.error('Get tracker session error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// ─── Create session (import roster + generate fixtures) ──────
router.post(
  '/sessions',
  validate({ body: CreateSessionBody }),
  async (req: AuthRequest, res: Response) => {
    try {
      const { tournamentId, format, config } = req.body;

      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        select: { id: true, sport: true },
      });
      if (!tournament) {
        res.status(404).json({ error: 'Tournament not found' });
        return;
      }
      if (tournament.sport !== 'BASKETBALL' && tournament.sport !== 'FOOTBALL') {
        res.status(400).json({ error: 'Stat tracker supports Basketball and Football only' });
        return;
      }

      const existing = await prisma.trackerSession.findUnique({ where: { tournamentId } });
      if (existing) {
        res.status(409).json({ error: 'A tracker session already exists for this tournament' });
        return;
      }

      // Import registered teams + accepted members (each carries a platform userId)
      const registrations = await prisma.tournamentTeam.findMany({
        where: { tournamentId },
        include: {
          team: {
            include: {
              members: {
                where: { status: 'ACCEPTED' },
                include: { user: { select: { id: true, name: true, position: true } } },
              },
            },
          },
        },
      });

      const roster = registrations.map((r) => ({
        teamId: r.team.id,
        name: r.team.name,
        players: r.team.members.map((m) => ({
          userId: m.user.id,
          name: m.user.name,
          position: m.user.position ?? null,
          number: null as number | null,
        })),
      }));

      const teamIds = roster.map((t) => t.teamId);
      if (teamIds.length < 2) {
        res.status(400).json({ error: 'At least 2 registered teams are required' });
        return;
      }

      const draw = generateDraw(format, teamIds, {
        groupsCount: config?.groupsCount,
        advancePerGroup: config?.advancePerGroup,
        thirdPlace: config?.thirdPlace,
      });

      const session = await prisma.trackerSession.create({
        data: {
          tournamentId,
          sport: tournament.sport,
          format,
          groups: draw.groups as object,
          bracket: (draw.bracket as object) ?? undefined,
          config: (config as object) ?? undefined,
          roster: roster as object,
          createdById: req.user!.userId,
          matches: {
            create: draw.fixtures.map((f) => ({
              stage: f.stage,
              round: f.round,
              groupId: f.groupId,
              bracketSlot: f.bracketSlot,
              feedsInto: f.feedsInto,
              orderIndex: f.orderIndex,
              homeTeamId: f.homeTeamId ?? null,
              awayTeamId: f.awayTeamId ?? null,
            })),
          },
        },
        include: { matches: { orderBy: { orderIndex: 'asc' } } },
      });

      res.status(201).json({ session });
    } catch (err) {
      console.error('Create tracker session error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// ─── Get a single match (with roster + standings) ────────────
router.get(
  '/matches/:id',
  validate({ params: IdParam }),
  async (req: AuthRequest, res: Response) => {
    try {
      const match = await prisma.trackerMatch.findUnique({
        where: { id: req.params.id as string },
        include: { session: true },
      });
      if (!match) {
        res.status(404).json({ error: 'Match not found' });
        return;
      }
      res.json({ match, session: match.session });
    } catch (err) {
      console.error('Get tracker match error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// ─── Patch live match state (autosave + broadcast) ───────────
router.patch(
  '/matches/:id',
  validate({ params: IdParam, body: PatchMatchBody }),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = req.params.id as string;
      const { state, homeScore, awayScore, status } = req.body;

      const existing = await prisma.trackerMatch.findUnique({
        where: { id },
        include: { session: true },
      });
      if (!existing) {
        res.status(404).json({ error: 'Match not found' });
        return;
      }
      if (existing.status === 'PUBLISHED') {
        res.status(409).json({ error: 'Match already published' });
        return;
      }

      const updated = await prisma.trackerMatch.update({
        where: { id },
        data: {
          ...(state !== undefined ? { state } : {}),
          ...(homeScore !== undefined ? { homeScore } : {}),
          ...(awayScore !== undefined ? { awayScore } : {}),
          ...(status !== undefined ? { status } : {}),
        },
      });

      // When a match completes, advance the bracket / seed knockout.
      if (status === 'COMPLETED' && existing.status !== 'COMPLETED') {
        const sess = existing.session;
        const bracket = sess.bracket as BracketDef | null;
        if (updated.bracketSlot) {
          await propagateBracket(sess.id, bracket, updated as TrackerMatchRow);
        }
        if (updated.stage === 'group') {
          await maybeSeedKnockout(sess);
        }
      }

      // Broadcast to spectators / co-scorers in the match room
      try {
        getIO().to(`tracker:${id}`).emit('tracker:state', updated);
      } catch {
        /* socket not initialised in some contexts — non-fatal */
      }

      res.json({ match: updated });
    } catch (err) {
      console.error('Patch tracker match error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// ─── Publish a finished match to the platform ────────────────
router.post(
  '/matches/:id/publish',
  validate({ params: IdParam }),
  async (req: AuthRequest, res: Response) => {
    try {
      const trackerMatch = await prisma.trackerMatch.findUnique({
        where: { id: req.params.id as string },
        include: { session: true },
      });
      if (!trackerMatch) {
        res.status(404).json({ error: 'Match not found' });
        return;
      }
      if (!trackerMatch.homeTeamId || !trackerMatch.awayTeamId) {
        res.status(400).json({ error: 'Match has no teams assigned yet' });
        return;
      }

      const { session } = trackerMatch;
      const tournamentId = session.tournamentId;
      const sport = session.sport;

      // Create or update the platform Match (update-in-place on re-publish)
      let platformMatchId = trackerMatch.publishedMatchId;
      if (platformMatchId) {
        await prisma.match.update({
          where: { id: platformMatchId },
          data: {
            homeScore: trackerMatch.homeScore,
            awayScore: trackerMatch.awayScore,
            status: 'COMPLETED',
          },
        });
      } else {
        const created = await prisma.match.create({
          data: {
            tournamentId,
            homeTeamId: trackerMatch.homeTeamId,
            awayTeamId: trackerMatch.awayTeamId,
            round: trackerMatch.round,
            matchDate: new Date(),
            homeScore: trackerMatch.homeScore,
            awayScore: trackerMatch.awayScore,
            status: 'COMPLETED',
          },
        });
        platformMatchId = created.id;
      }

      // Write per-player stats to the right sport-specific table (profiles)
      const playerStats = derivePlayerStats(sport, trackerMatch.state);
      await writeMatchPlayerStats({ matchId: platformMatchId, tournamentId, sport, playerStats });

      await prisma.trackerMatch.update({
        where: { id: trackerMatch.id },
        data: { status: 'PUBLISHED', publishedMatchId: platformMatchId },
      });

      res.json({ published: true, matchId: platformMatchId, playerCount: playerStats.length });
    } catch (err) {
      console.error('Publish tracker match error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export default router;
