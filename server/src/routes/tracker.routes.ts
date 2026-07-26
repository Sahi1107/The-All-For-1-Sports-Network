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
  seedFirstRound,
  bracketAdvancements,
  type BracketDef,
  type GroupDef,
} from '../services/trackerDraw';
import { derivePlayerStats } from '../services/trackerStats';
import { writeMatchPlayerStats } from '../services/matchStats';
import {
  CreateSessionBody,
  PatchMatchBody,
  ScheduleBody,
  IdParam,
  TournamentIdParam,
} from '../validation/tracker';

// Stage ordering for sequential scheduling (groups first, then knockout rounds).
const STAGE_SCHED_RANK: Record<string, number> = {
  group: 0, league: 0, r32: 1, r16: 2, qf: 3, sf: 4, third_place: 5, final: 6,
};
// A bye is auto-resolved (one team, marked done) — never scheduled.
const isByeMatch = (m: { status: string; homeTeamId: string | null; awayTeamId: string | null }) =>
  (m.status === 'COMPLETED' || m.status === 'PUBLISHED') && (!!m.homeTeamId !== !!m.awayTeamId);

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
 *  into every slot it feeds. A semifinal feeds two slots — the final (winner)
 *  and, when enabled, the third-place playoff (loser) — so advancements are
 *  resolved from the bracket's `feedFrom` (see bracketAdvancements) rather than
 *  the match's single `feedsInto` field, which cannot represent feeding two
 *  slots at once. */
async function propagateBracket(
  sessionId: string,
  bracket: BracketDef | null,
  completed: TrackerMatchRow,
) {
  if (!bracket) return;
  for (const adv of bracketAdvancements(bracket, completed)) {
    const targetMatch = await prisma.trackerMatch.findFirst({
      where: { sessionId, bracketSlot: adv.slotId },
    });
    if (!targetMatch) continue;
    await prisma.trackerMatch.update({
      where: { id: targetMatch.id },
      data: adv.side === 'home' ? { homeTeamId: adv.teamId } : { awayTeamId: adv.teamId },
    });
  }
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

  // Seed the first knockout round, distributing byes for a non-power-of-2 count
  // (e.g. 3 groups × 2 advancing = 6). Byes auto-advance into their parent slot.
  const { seeds, byeAdvances } = seedFirstRound(bracket, order);
  for (const seed of seeds) {
    const match = matches.find((m) => m.bracketSlot === seed.slotId);
    if (!match) continue;
    await prisma.trackerMatch.update({
      where: { id: match.id },
      data: {
        homeTeamId: seed.home,
        awayTeamId: seed.away,
        ...(seed.bye ? { status: 'COMPLETED' as const } : {}),
      },
    });
  }
  for (const adv of byeAdvances) {
    const parent = matches.find((m) => m.bracketSlot === adv.slotId);
    if (!parent) continue;
    await prisma.trackerMatch.update({
      where: { id: parent.id },
      data: adv.side === 'home' ? { homeTeamId: adv.teamId } : { awayTeamId: adv.teamId },
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
              ...(f.status ? { status: f.status } : {}),
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

// ─── Reset a session (regenerate the draw) ───────────────────
// Deletes the tracker session (cascades its TrackerMatch rows) AND any platform
// Match rows those fixtures published (cascading per-player stats), so re-drawing
// is a true clean slate with no orphaned results. Admin-only (router-level guard).
router.delete(
  '/sessions/:tournamentId',
  validate({ params: TournamentIdParam }),
  async (req: AuthRequest, res: Response) => {
    try {
      const tournamentId = req.params.tournamentId as string;
      const session = await prisma.trackerSession.findUnique({
        where: { tournamentId },
        include: { matches: { select: { publishedMatchId: true } } },
      });
      if (!session) {
        res.status(404).json({ error: 'No draw to reset for this tournament' });
        return;
      }

      const publishedMatchIds = session.matches
        .map((m) => m.publishedMatchId)
        .filter((id): id is string => !!id);

      await prisma.$transaction(async (tx) => {
        if (publishedMatchIds.length > 0) {
          // Cascades FootballStats / BasketballStats / CricketStats for these matches.
          await tx.match.deleteMany({ where: { id: { in: publishedMatchIds } } });
        }
        // Cascades the session's TrackerMatch rows.
        await tx.trackerSession.delete({ where: { id: session.id } });
      });

      res.json({ reset: true, deletedPublishedMatches: publishedMatchIds.length });
    } catch (err) {
      console.error('Reset tracker session error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// ─── Bulk / sequential auto-scheduling ───────────────────────
// Assigns scheduledAt + court to eligible fixtures in waves across the given
// courts (groups first, then knockout rounds by orderIndex). Byes are skipped;
// `onlyUnscheduled` leaves already-scheduled matches alone. Fine-tune individual
// matches afterwards via PATCH.
router.post(
  '/sessions/:tournamentId/schedule',
  validate({ params: TournamentIdParam, body: ScheduleBody }),
  async (req: AuthRequest, res: Response) => {
    try {
      const tournamentId = req.params.tournamentId as string;
      const { startAt, matchMinutes, gapMinutes, courts, onlyUnscheduled } = req.body;

      const session = await prisma.trackerSession.findUnique({
        where: { tournamentId },
        include: { matches: true },
      });
      if (!session) {
        res.status(404).json({ error: 'No draw to schedule — generate fixtures first' });
        return;
      }

      const slotMs = (matchMinutes + gapMinutes) * 60_000;
      const start = new Date(startAt).getTime();
      const eligible = session.matches
        .filter((m) => !isByeMatch(m))
        .filter((m) => (onlyUnscheduled ? !m.scheduledAt : true))
        .sort(
          (a, b) =>
            (STAGE_SCHED_RANK[a.stage] ?? 9) - (STAGE_SCHED_RANK[b.stage] ?? 9) ||
            a.orderIndex - b.orderIndex,
        );

      await prisma.$transaction(
        eligible.map((m, i) => {
          const wave = Math.floor(i / courts.length);
          return prisma.trackerMatch.update({
            where: { id: m.id },
            data: { scheduledAt: new Date(start + wave * slotMs), court: courts[i % courts.length] },
          });
        }),
      );

      res.json({ scheduled: eligible.length });
    } catch (err) {
      console.error('Auto-schedule error:', err);
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
      const { state, homeScore, awayScore, status, homeTeamId, awayTeamId, scheduledAt, court } = req.body;

      const existing = await prisma.trackerMatch.findUnique({
        where: { id },
        include: { session: true },
      });
      if (!existing) {
        res.status(404).json({ error: 'Match not found' });
        return;
      }
      if (existing.status === 'PUBLISHED') {
        res.status(409).json({ error: 'Match already published — unpublish it first to make changes' });
        return;
      }

      const updated = await prisma.trackerMatch.update({
        where: { id },
        data: {
          ...(state !== undefined ? { state } : {}),
          ...(homeScore !== undefined ? { homeScore } : {}),
          ...(awayScore !== undefined ? { awayScore } : {}),
          ...(status !== undefined ? { status } : {}),
          ...(homeTeamId !== undefined ? { homeTeamId } : {}),
          ...(awayTeamId !== undefined ? { awayTeamId } : {}),
          ...(scheduledAt !== undefined ? { scheduledAt } : {}),
          ...(court !== undefined ? { court: court || null } : {}),
        },
      });

      // Whenever a knockout match is (or stays) COMPLETED, (re)propagate — so a
      // corrected result that flips the winner flows through the bracket. The
      // advancement side is deterministic (feedFrom order), so re-running simply
      // overwrites the parent slot with the current winner.
      if (updated.status === 'COMPLETED') {
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
            ...(trackerMatch.scheduledAt ? { matchDate: trackerMatch.scheduledAt } : {}),
            court: trackerMatch.court,
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
            matchDate: trackerMatch.scheduledAt ?? new Date(),
            court: trackerMatch.court,
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

// ─── Un-publish a match (revert to editable, remove platform data) ───
// Deletes the platform Match (cascading its per-player stats) and returns the
// tracker match to COMPLETED so it can be corrected and re-published.
router.post(
  '/matches/:id/unpublish',
  validate({ params: IdParam }),
  async (req: AuthRequest, res: Response) => {
    try {
      const trackerMatch = await prisma.trackerMatch.findUnique({ where: { id: req.params.id as string } });
      if (!trackerMatch) {
        res.status(404).json({ error: 'Match not found' });
        return;
      }
      if (trackerMatch.status !== 'PUBLISHED') {
        res.status(400).json({ error: 'Match is not published' });
        return;
      }

      await prisma.$transaction(async (tx) => {
        if (trackerMatch.publishedMatchId) {
          await tx.match.deleteMany({ where: { id: trackerMatch.publishedMatchId } });
        }
        await tx.trackerMatch.update({
          where: { id: trackerMatch.id },
          data: { status: 'COMPLETED', publishedMatchId: null },
        });
      });

      res.json({ unpublished: true });
    } catch (err) {
      console.error('Unpublish tracker match error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export default router;
