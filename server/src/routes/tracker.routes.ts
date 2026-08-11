import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/db';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireTournamentAccess, fromParamTournamentId, fromBodyTournamentId, fromTrackerMatchId } from '../middleware/tournamentAccess';
import { validate } from '../middleware/validate';
import { getIO } from '../config/socket';
import {
  generateDraw,
  computeStandings,
  seedOrderFromGroups,
  seedFirstRound,
  groupOfTeams,
  bracketAdvancements,
  groupRoundRobin,
  planGroupFixtures,
  isPlayed,
  type BracketDef,
  type GroupDef,
} from '../services/trackerDraw';
import { derivePlayerStats } from '../services/trackerStats';
import { fanoutMatchResult, fanoutDrawPublished, fanoutFixturesScheduled, fanoutStatsVerified, slotLabel } from '../services/notifications/competitionNotify';
import { writeMatchPlayerStats } from '../services/matchStats';
import { recalculateTournamentRankings } from '../services/rankingService';
import { mergeRoster, rosterSignature } from '../services/rosterLifecycle';
import { backfillGenderFromTournament } from '../services/genderBackfill';
import {
  BoxScoreError, BOX_SCORE_SPORTS, publishBoxScore, notifyBoxScorePublished,
  toPlayerStats, loadStatRows, assertBoxScoreRosters,
} from '../services/manualBoxScore';
import { FixtureBoxScoreBody } from '@af1/validation';
import { bustTournament } from '../services/tournamentCache';
import logger from '../utils/logger';
import { captureException } from '../config/sentry';
import {
  CreateSessionBody,
  PatchMatchBody,
  ScheduleBody,
  GroupsBody,
  WithdrawBody,
  JerseysBody,
  IdParam,
  TournamentIdParam,
} from '@af1/validation';

const DONE_STATUS = (s: string) => s === 'COMPLETED' || s === 'PUBLISHED';

type RosterSnapshot = {
  teamId: string;
  name: string;
  players: { userId: string; name: string; position: string | null; number: number | null }[];
};

/** Jersey numbers a scorer has already entered, keyed by userId. */
function jerseyMap(prev: unknown): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (const team of (prev as RosterSnapshot[] | null) ?? []) {
    for (const p of team?.players ?? []) {
      if (p?.userId && p.number !== null && p.number !== undefined) out.set(p.userId, p.number);
    }
  }
  return out;
}

/** Snapshot roster for the session from the tournament's current registrations
 *  (accepted members). Rebuilt on structure edits so late entries + roster
 *  changes are reflected. Jersey numbers already entered for a player are
 *  carried across the rebuild — they're hand-keyed by the scorer and are not
 *  recoverable from the registrations, so a group edit must not blank them. */
async function buildRosterSnapshot(tournamentId: string, prevRoster?: unknown): Promise<RosterSnapshot[]> {
  const regs = await prisma.tournamentTeam.findMany({
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
  const keep = jerseyMap(prevRoster);
  return regs.map((r) => ({
    teamId: r.team.id,
    name: r.team.name,
    players: r.team.members.map((m) => ({
      userId: m.user.id,
      name: m.user.name,
      position: m.user.position ?? null,
      number: keep.get(m.user.id) ?? null,
    })),
  }));
}

/**
 * Bring the session's roster snapshot up to date with the teams' current accepted
 * members, so a player added after the draw can be scored immediately — no draw
 * reset. Jersey numbers already entered are preserved (buildRosterSnapshot carries
 * them), and recorded stats are never touched: they live on TrackerMatch.state.
 * Non-fatal — any failure serves the stored snapshot unchanged rather than
 * breaking a live scoring page.
 */
async function refreshSessionRoster(session: {
  id: string; tournamentId: string; roster: unknown;
}): Promise<unknown> {
  try {
    const fresh = await buildRosterSnapshot(session.tournamentId, session.roster);
    const merged = mergeRoster((session.roster as RosterSnapshot[] | null) ?? [], fresh);
    if (rosterSignature(merged) === rosterSignature(session.roster)) return session.roster;
    await prisma.trackerSession.update({ where: { id: session.id }, data: { roster: merged as object } });
    return merged;
  } catch (err) {
    console.error(`[tracker] roster refresh failed for session ${session.id} (keeping stored snapshot):`, err);
    return session.roster;
  }
}

// Stage ordering for sequential scheduling (groups first, then knockout rounds).
const STAGE_SCHED_RANK: Record<string, number> = {
  group: 0, league: 0, r32: 1, r16: 2, qf: 3, sf: 4, third_place: 5, final: 6,
};
// A bye is auto-resolved (one team, marked done) — never scheduled.
const isByeMatch = (m: { status: string; homeTeamId: string | null; awayTeamId: string | null }) =>
  (m.status === 'COMPLETED' || m.status === 'PUBLISHED') && (!!m.homeTeamId !== !!m.awayTeamId);

const router = Router();
// Auth is required for every tracker route; tournament-scoped authorisation is
// applied PER ROUTE below via requireTournamentAccess (super-admin OR the
// assigned organiser for that tournament). Every route MUST carry it.
router.use(authenticate);

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
  sport: string;
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
  // Ranked PER GROUP, not as one combined table. Basketball breaks ties on the
  // games the tied teams played against each other, and teams in different
  // groups never meet — so a single table across every group would compare
  // records that have no head-to-head to decide them. Each group's own matches
  // go in with it; concatenating the ranked groups keeps seedOrderFromGroups'
  // per-group filter reading them in the right order.
  const standings = groups.flatMap((g) =>
    computeStandings(
      g.teamIds,
      groupMatches.filter((m) => m.groupId === g.id),
      session.sport,
    ),
  );
  const order = seedOrderFromGroups(groups, standings, advancePerGroup);

  // Seed the first knockout round. The group map is what keeps two teams out of
  // the same group from meeting again immediately — they have just played each
  // other in the group stage. Byes (a non-power-of-2 count, e.g. 3 groups × 2
  // advancing = 6) fall to the best-placed qualifiers and auto-advance into
  // their parent slot.
  const { seeds, byeAdvances } = seedFirstRound(bracket, order, groupOfTeams(groups));
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
  requireTournamentAccess(fromParamTournamentId),
  validate({ params: TournamentIdParam }),
  async (req: AuthRequest, res: Response) => {
    try {
      const session = await prisma.trackerSession.findUnique({
        where: { tournamentId: req.params.tournamentId as string },
        include: { matches: { orderBy: { orderIndex: 'asc' } } },
      });

      // Where each published result CAME from (live tracking vs a typed box
      // score). The fixtures list needs it to decide whether "Box score" is an
      // offer to correct a sheet or would silently discard an event log — the
      // distinction lives on the platform Match, not on the fixture. One query
      // for the whole session, not one per fixture.
      let matches = session?.matches ?? [];
      if (session) {
        const publishedIds = matches
          .map((m) => m.publishedMatchId)
          .filter((id): id is string => !!id);
        const sources = publishedIds.length
          ? await prisma.match.findMany({
              where: { id: { in: publishedIds } },
              select: { id: true, statsSource: true },
            })
          : [];
        const sourceOf = new Map(sources.map((s) => [s.id, s.statsSource]));
        matches = matches.map((m) => ({
          ...m,
          statsSource: m.publishedMatchId ? sourceOf.get(m.publishedMatchId) ?? null : null,
        })) as typeof matches;
      }

      res.json({ session: session ? { ...session, matches } : null });
    } catch (err) {
      console.error('Get tracker session error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// ─── Create session (import roster + generate fixtures) ──────
router.post(
  '/sessions',
  requireTournamentAccess(fromBodyTournamentId),
  validate({ body: CreateSessionBody }),
  async (req: AuthRequest, res: Response) => {
    try {
      const { tournamentId, format, config } = req.body;

      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
        select: { id: true, sport: true, name: true },
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

      // Fire-and-forget: tell every registered player the draw is out.
      const drawPlayerIds = roster.flatMap((t) => t.players.map((p) => p.userId)).filter(Boolean);
      void fanoutDrawPublished({ tournamentId, tournamentName: tournament.name, playerIds: drawPlayerIds })
        .catch((e) => console.error('draw notify failed', e));
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
  requireTournamentAccess(fromParamTournamentId),
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

// ─── Re-seed the knockout from the current group standings ───
// Correction path for a bracket that was seeded from standings since found to be
// wrong — the basketball head-to-head tiebreak is the case this exists for: a
// group stage seeded before it landed sent the wrong team through, and nothing
// re-derives that on its own. maybeSeedKnockout deliberately refuses to touch a
// bracket that already has teams (otherwise every result would rewrite the draw),
// so this clears the seeding first and lets it run again.
//
// REFUSES once a knockout match has been played. At that point the seeding is not
// a prediction to correct but a game that happened, and re-drawing would orphan a
// real result. That case needs a human decision (replay it, or reset the draw).
router.post(
  '/sessions/:tournamentId/reseed-knockout',
  requireTournamentAccess(fromParamTournamentId),
  validate({ params: TournamentIdParam }),
  async (req: AuthRequest, res: Response) => {
    try {
      const tournamentId = req.params.tournamentId as string;
      const session = await prisma.trackerSession.findUnique({
        where: { tournamentId },
        include: { matches: true },
      });
      if (!session) {
        res.status(404).json({ error: 'No draw for this tournament' });
        return;
      }

      const bracket = session.bracket as BracketDef | null;
      const groups = (session.groups as GroupDef[] | null) ?? [];
      if (!bracket || !bracket.stages.length || !groups.length) {
        res.status(400).json({ error: 'This tournament has no group stage feeding a knockout', code: 'NO_KNOCKOUT' });
        return;
      }

      // Re-seeding derives the bracket from the group table, so the group stage
      // has to be finished — otherwise this would clear the slots and
      // maybeSeedKnockout would decline to refill them, leaving an empty bracket.
      const groupStage = session.matches.filter((m) => m.stage === 'group');
      const groupsDone = groupStage.length > 0 && groupStage.every((m) => isPlayed(m.status));
      if (!groupsDone) {
        res.status(409).json({
          error: 'The group stage is not finished, so there are no final standings to seed from.',
          code: 'GROUPS_INCOMPLETE',
        });
        return;
      }

      const knockout = session.matches.filter((m) => m.stage !== 'group' && m.stage !== 'league');
      // A BYE is marked COMPLETED with only one side filled — nobody played it,
      // and it is re-derived from scratch, so it must not read as a played tie.
      const alreadyPlayed = knockout.filter(
        (m) => !!m.publishedMatchId
          || ((isPlayed(m.status) || m.status === 'IN_PROGRESS') && !!m.homeTeamId && !!m.awayTeamId),
      );
      if (alreadyPlayed.length > 0) {
        res.status(409).json({
          error: `${alreadyPlayed.length} knockout match${alreadyPlayed.length === 1 ? ' has' : 'es have'} already been played, so the bracket can no longer be re-seeded. Un-publish those results first, or reset the draw.`,
          code: 'KNOCKOUT_IN_PROGRESS',
          playedMatchIds: alreadyPlayed.map((m) => m.id),
        });
        return;
      }

      const before = knockout
        .filter((m) => m.homeTeamId || m.awayTeamId)
        .map((m) => ({ id: m.id, homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId }));

      // Clear every knockout slot, then re-derive from the current standings.
      await prisma.trackerMatch.updateMany({
        where: { id: { in: knockout.map((m) => m.id) } },
        data: { homeTeamId: null, awayTeamId: null, homeScore: 0, awayScore: 0, status: 'SCHEDULED' },
      });
      await maybeSeedKnockout(session);

      const after = await prisma.trackerMatch.findMany({
        where: { id: { in: knockout.map((m) => m.id) } },
        select: { id: true, homeTeamId: true, awayTeamId: true },
      });
      const wasBefore = new Map(before.map((m) => [m.id, m]));
      const changed = after.filter((m) => {
        const prev = wasBefore.get(m.id);
        return (prev?.homeTeamId ?? null) !== m.homeTeamId || (prev?.awayTeamId ?? null) !== m.awayTeamId;
      });

      bustTournament(tournamentId);
      logger.info('tracker.knockout_reseeded', {
        tournamentId, by: req.user!.userId, cleared: before.length, changed: changed.length,
      });
      res.json({ reseeded: true, changed: changed.length, matches: after });
    } catch (err) {
      console.error('Re-seed knockout error:', err);
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
  requireTournamentAccess(fromParamTournamentId),
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

      // Fire-and-forget: tell each player their next match time + court.
      void (async () => {
        try {
          const teamEarliest = new Map<string, Date>();
          const teamCourt = new Map<string, string>();
          eligible.forEach((m, i) => {
            const at = new Date(start + Math.floor(i / courts.length) * slotMs);
            const court = courts[i % courts.length];
            for (const tid of [m.homeTeamId, m.awayTeamId]) {
              if (!tid) continue;
              if (!teamEarliest.has(tid) || at < teamEarliest.get(tid)!) { teamEarliest.set(tid, at); teamCourt.set(tid, court); }
            }
          });
          const roster = (session.roster as { teamId: string; players?: { userId?: string }[] }[] | null) ?? [];
          const perUser: { userId: string; next?: string }[] = [];
          for (const team of roster) {
            const next = slotLabel(teamEarliest.get(team.teamId) ?? null, teamCourt.get(team.teamId) ?? null);
            for (const p of team.players ?? []) if (p.userId) perUser.push({ userId: p.userId, next });
          }
          const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { name: true } });
          await fanoutFixturesScheduled({ tournamentId, tournamentName: t?.name ?? 'Your tournament', perUser });
        } catch (e) { console.error('fixtures notify failed', e); }
      })();
    } catch (err) {
      console.error('Auto-schedule error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// ─── Edit group structure (rename / move / add / remove teams) ───
// Saves the whole groups layout. Groups whose composition changed are
// regenerated (round-robin); a changed group that already has results is
// rejected (reset the draw instead). Roster is rebuilt so late entries appear.
router.patch(
  '/sessions/:tournamentId/groups',
  requireTournamentAccess(fromParamTournamentId),
  validate({ params: TournamentIdParam, body: GroupsBody }),
  async (req: AuthRequest, res: Response) => {
    try {
      const tournamentId = req.params.tournamentId as string;
      const newGroups = req.body.groups as GroupDef[];

      const session = await prisma.trackerSession.findUnique({
        where: { tournamentId },
        include: { matches: true },
      });
      if (!session) {
        res.status(404).json({ error: 'No draw for this tournament' });
        return;
      }
      if (!((session.groups as GroupDef[] | null)?.length)) {
        res.status(400).json({ error: 'This format has no groups to edit' });
        return;
      }

      // Validate: every team is registered, and no team is in two groups.
      const regs = await prisma.tournamentTeam.findMany({ where: { tournamentId }, select: { teamId: true } });
      const registered = new Set(regs.map((r) => r.teamId));
      const seen = new Set<string>();
      for (const g of newGroups) {
        for (const t of g.teamIds) {
          if (!registered.has(t)) { res.status(400).json({ error: 'A team is not registered for this tournament' }); return; }
          if (seen.has(t)) { res.status(400).json({ error: 'A team appears in more than one group' }); return; }
          seen.add(t);
        }
      }

      const oldGroups = (session.groups as GroupDef[] | null) ?? [];
      const oldById = new Map(oldGroups.map((g) => [g.id, g]));
      const groupMatches = session.matches.filter((m) => m.stage === 'group');
      const sortedKey = (ids: string[]) => [...ids].sort().join(',');

      const changedIds: string[] = [];
      const renamedOnly: GroupDef[] = [];
      for (const g of newGroups) {
        const old = oldById.get(g.id);
        const compChanged = !old || sortedKey(g.teamIds) !== sortedKey(old.teamIds);
        if (compChanged) changedIds.push(g.id);
        else if (old.name !== g.name) renamedOnly.push(g);
      }
      const removedIds = oldGroups.filter((o) => !newGroups.some((g) => g.id === o.id)).map((o) => o.id);

      // A group edit re-plans only the fixtures that HAVEN'T been played. Results
      // that already happened are the record of a real game — they stay, and the
      // teams in them stay with them.
      const affectedIds = [...changedIds, ...removedIds];

      // An admin can restructure a group at ANY time, including one with results.
      // Nothing played is ever deleted: a result is the record of a real game, so
      // it survives the edit regardless of where its teams end up.
      //
      // Where BOTH teams of a played match sit in the same group afterwards, the
      // match moves with them and keeps counting. Where they've been split across
      // groups, it stays on its original fixture — computeStandings ignores a
      // match unless both teams are in the table it's building, so the result
      // remains on record (and on the players' profiles) without corrupting
      // either group's standings. That count is reported back so the admin knows.
      const groupOfTeam = new Map<string, string>();
      newGroups.forEach((g) => g.teamIds.forEach((t) => groupOfTeam.set(t, g.id)));
      const regroup: { id: string; groupId: string }[] = [];
      let splitResults = 0;
      for (const m of groupMatches) {
        if (!isPlayed(m.status) || !m.homeTeamId || !m.awayTeamId) continue;
        const gh = groupOfTeam.get(m.homeTeamId);
        const ga = groupOfTeam.get(m.awayTeamId);
        if (gh && gh === ga) {
          if (gh !== m.groupId) regroup.push({ id: m.id, groupId: gh });
        } else {
          splitResults++;
        }
      }

      // A knockout seeded from the OLD standings is stale once groups change, and
      // maybeSeedKnockout refuses to re-seed a bracket that already has teams — so
      // clear the seeding to let it re-seed. Only UNPLAYED knockout matches are
      // cleared; a knockout tie that has actually been played is a result like any
      // other and is left exactly as it is.
      const knockoutMatches = session.matches.filter((m) => m.stage !== 'group');
      const seededKnockout = knockoutMatches.filter((m) => (m.homeTeamId || m.awayTeamId) && !isPlayed(m.status));
      const resetKnockout = affectedIds.length > 0 && seededKnockout.length > 0;

      const roster = await buildRosterSnapshot(tournamentId, session.roster);
      let nextOrder = Math.max(0, ...session.matches.map((m) => m.orderIndex)) + 1;

      // Plan each changed group before touching anything, so the whole edit is
      // one consistent transaction rather than a sequence of partial rewrites.
      const plans = newGroups
        .filter((g) => changedIds.includes(g.id))
        .map((g) => {
          const plan = planGroupFixtures(g, groupMatches.filter((m) => m.groupId === g.id), nextOrder);
          nextOrder += plan.create.length;
          return { group: g, plan };
        });
      // A removed group keeps nothing: its unplayed fixtures go (played ones were
      // already rejected above, so there are none).
      const removedUnplayed = groupMatches
        .filter((m) => removedIds.includes(m.groupId ?? '') && !isPlayed(m.status))
        .map((m) => m.id);

      const toRemove = [...plans.flatMap((p) => p.plan.remove), ...removedUnplayed];
      const toCreate = plans.flatMap((p) => p.plan.create);

      await prisma.$transaction(async (tx) => {
        if (resetKnockout) {
          // Back to an unseeded bracket so the new group stage can re-seed it.
          await tx.trackerMatch.updateMany({
            where: { id: { in: seededKnockout.map((m) => m.id) } },
            data: { homeTeamId: null, awayTeamId: null, homeScore: 0, awayScore: 0, status: 'SCHEDULED', state: Prisma.DbNull },
          });
        }
        if (toRemove.length) {
          await tx.trackerMatch.deleteMany({ where: { id: { in: toRemove } } });
        }
        // Played matches whose teams both moved follow them, so the result keeps
        // counting in the group those teams now sit in.
        for (const r of regroup) {
          await tx.trackerMatch.update({ where: { id: r.id }, data: { groupId: r.groupId } });
        }
        if (toCreate.length) {
          await tx.trackerMatch.createMany({
            data: toCreate.map((f) => ({
              sessionId: session.id, stage: f.stage, round: f.round, groupId: f.groupId,
              orderIndex: f.orderIndex, homeTeamId: f.homeTeamId ?? null, awayTeamId: f.awayTeamId ?? null,
            })),
          });
        }
        // A rename must reach every fixture in the group, including kept ones.
        for (const g of [...renamedOnly, ...plans.map((p) => p.group)]) {
          await tx.trackerMatch.updateMany({ where: { sessionId: session.id, stage: 'group', groupId: g.id }, data: { round: g.name } });
        }
        await tx.trackerSession.update({ where: { id: session.id }, data: { groups: newGroups as object, roster: roster as object } });
      });

      // Nothing played was touched, so no stats moved and the rankings are
      // unaffected — no recompute needed here.
      res.json({
        ok: true,
        fixturesAdded: toCreate.length,
        fixturesRemoved: toRemove.length,
        resultsPreserved: groupMatches.filter((m) => isPlayed(m.status)).length,
        resultsMoved: regroup.length,
        // Played matches whose two teams now sit in different groups. Still on
        // record and still on the players' profiles, but no longer counting in
        // either group's table — worth telling the admin about.
        resultsSplitAcrossGroups: splitResults,
        knockoutReseeded: resetKnockout ? seededKnockout.length : 0,
      });
    } catch (err) {
      console.error('Edit groups error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// ─── Save jersey numbers ─────────────────────────────────────
// Scorers set these on the roster snapshot before tipping off. Numbers are how
// a scorer identifies a player on court, so a duplicate inside one team is a
// real scoring hazard, not a cosmetic issue — it's rejected rather than saved.
router.patch(
  '/sessions/:tournamentId/jerseys',
  requireTournamentAccess(fromParamTournamentId),
  validate({ params: TournamentIdParam, body: JerseysBody }),
  async (req: AuthRequest, res: Response) => {
    try {
      const tournamentId = req.params.tournamentId as string;
      const numbers = req.body.numbers as { userId: string; number: number | null }[];

      const session = await prisma.trackerSession.findUnique({ where: { tournamentId } });
      if (!session) { res.status(404).json({ error: 'No draw for this tournament' }); return; }

      const incoming = new Map(numbers.map((n) => [n.userId, n.number]));
      const roster = ((session.roster as RosterSnapshot[] | null) ?? []).map((team) => ({
        ...team,
        players: (team.players ?? []).map((p) => (
          incoming.has(p.userId) ? { ...p, number: incoming.get(p.userId) ?? null } : p
        )),
      }));

      for (const team of roster) {
        const seen = new Map<number, string>();
        for (const p of team.players) {
          if (p.number === null || p.number === undefined) continue;
          const clash = seen.get(p.number);
          if (clash) {
            res.status(400).json({ error: `${team.name}: #${p.number} is assigned to both ${clash} and ${p.name}` });
            return;
          }
          seen.set(p.number, p.name);
        }
      }

      await prisma.trackerSession.update({ where: { id: session.id }, data: { roster: roster as object } });
      res.json({ roster });
    } catch (err) {
      console.error('Save jersey numbers error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// ─── Withdraw a team ─────────────────────────────────────────
// Before its matches start: cleanly removed and its group regenerated. After:
// its remaining fixtures become walkovers to opponents (bracket winners
// propagate), so results stay consistent — no dead matches.
router.post(
  '/sessions/:tournamentId/withdraw',
  requireTournamentAccess(fromParamTournamentId),
  validate({ params: TournamentIdParam, body: WithdrawBody }),
  async (req: AuthRequest, res: Response) => {
    try {
      const tournamentId = req.params.tournamentId as string;
      const { teamId } = req.body;

      const session = await prisma.trackerSession.findUnique({ where: { tournamentId }, include: { matches: true } });
      if (!session) { res.status(404).json({ error: 'No draw for this tournament' }); return; }

      const bracket = session.bracket as BracketDef | null;
      const groups = (session.groups as GroupDef[] | null) ?? [];
      const teamMatches = session.matches.filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId);
      const teamGroupIds = groups.filter((g) => g.teamIds.includes(teamId)).map((g) => g.id);
      const anyPlayed =
        teamMatches.some((m) => DONE_STATUS(m.status)) ||
        session.matches.some((m) => m.groupId && teamGroupIds.includes(m.groupId) && DONE_STATUS(m.status));

      if (!anyPlayed) {
        // Clean removal + regenerate affected groups.
        const newGroups = groups.map((g) => ({ ...g, teamIds: g.teamIds.filter((t) => t !== teamId) }));
        let nextOrder = Math.max(0, ...session.matches.map((m) => m.orderIndex)) + 1;
        for (const g of newGroups.filter((g) => teamGroupIds.includes(g.id))) {
          await prisma.trackerMatch.deleteMany({ where: { sessionId: session.id, stage: 'group', groupId: g.id } });
          const fx = groupRoundRobin(g, nextOrder);
          nextOrder += fx.length;
          if (fx.length) {
            await prisma.trackerMatch.createMany({
              data: fx.map((f) => ({
                sessionId: session.id, stage: f.stage, round: f.round, groupId: f.groupId,
                orderIndex: f.orderIndex, homeTeamId: f.homeTeamId ?? null, awayTeamId: f.awayTeamId ?? null,
              })),
            });
          }
        }
        // Clear the team from any (unplayed) knockout slots.
        for (const m of teamMatches.filter((m) => m.bracketSlot && !DONE_STATUS(m.status))) {
          await prisma.trackerMatch.update({
            where: { id: m.id },
            data: m.homeTeamId === teamId ? { homeTeamId: null } : { awayTeamId: null },
          });
        }
        await prisma.trackerSession.update({ where: { id: session.id }, data: { groups: newGroups as object } });
        res.json({ withdrawn: true, mode: 'removed' });
        return;
      }

      // Forfeit path: walkover remaining fixtures to the opponent (keep the team
      // in its group so standings stay consistent).
      for (const m of teamMatches) {
        if (DONE_STATUS(m.status)) continue;
        const oppIsHome = m.awayTeamId === teamId; // opponent occupies the other side
        const opponentId = oppIsHome ? m.homeTeamId : m.awayTeamId;
        if (opponentId) {
          const updated = await prisma.trackerMatch.update({
            where: { id: m.id },
            data: { homeScore: oppIsHome ? 1 : 0, awayScore: oppIsHome ? 0 : 1, status: 'COMPLETED' },
          });
          if (m.bracketSlot) await propagateBracket(session.id, bracket, updated as TrackerMatchRow);
          if (m.stage === 'group') await maybeSeedKnockout(session);
        } else {
          await prisma.trackerMatch.update({
            where: { id: m.id },
            data: m.homeTeamId === teamId ? { homeTeamId: null } : { awayTeamId: null },
          });
        }
      }
      res.json({ withdrawn: true, mode: 'forfeit' });
    } catch (err) {
      console.error('Withdraw team error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// ─── Get a single match (with roster + standings) ────────────
router.get(
  '/matches/:id',
  requireTournamentAccess(fromTrackerMatchId),
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
      // Reconcile with current team members so a player added after the draw is
      // scoreable on this match without regenerating the draw.
      const roster = await refreshSessionRoster(match.session);
      res.json({ match, session: { ...match.session, roster } });
    } catch (err) {
      console.error('Get tracker match error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// ─── Patch live match state (autosave + broadcast) ───────────
router.patch(
  '/matches/:id',
  requireTournamentAccess(fromTrackerMatchId),
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

      // Admins may re-point a fixture at different teams to fix a wrong draw —
      // but only while it hasn't been played. Once a match is live or finished,
      // its stats are recorded against THESE teams; swapping them would reassign
      // a real performance to a side that never played it. Scores and state stay
      // editable (this is also the live autosave path) — only the teams lock.
      const changingTeams =
        (homeTeamId !== undefined && homeTeamId !== existing.homeTeamId) ||
        (awayTeamId !== undefined && awayTeamId !== existing.awayTeamId);
      if (changingTeams && isPlayed(existing.status)) {
        res.status(409).json({
          error: 'This match has already been played — its teams can\'t be changed. Correct the result, or un-publish and reset it first.',
        });
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
  requireTournamentAccess(fromTrackerMatchId),
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
            // Reclaim ownership. This fixture may have been box-scored manually
            // first and then actually tracked; live tracking is the more
            // authoritative record, so it takes the match back. Without this the
            // match would stay flagged MANUAL and the box-score editor would keep
            // offering to correct numbers the next tracker publish overwrites.
            statsSource: 'TRACKER',
            enteredById: null,
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

      // Playing a men's or women's tournament settles a player's category. Many
      // provisioned accounts have no gender on file, and the rankings split
      // men's from women's — without this they'd be ranked on neither board.
      // Only fills a BLANK: never overwrites what an athlete set themselves, and
      // a MIXED/OPEN tournament implies nothing so it leaves them alone.
      await backfillGenderFromTournament(tournamentId, playerStats.map((p) => p.userId));

      await prisma.trackerMatch.update({
        where: { id: trackerMatch.id },
        data: { status: 'PUBLISHED', publishedMatchId: platformMatchId },
      });

      res.json({ published: true, matchId: platformMatchId, playerCount: playerStats.length });

      // Rankings derive from published stats — recompute so the Rankings page and
      // profile receipts reflect this result. Fire-and-forget: a ranking hiccup
      // must never fail the publish itself.
      void recalculateTournamentRankings(tournamentId).catch((e) => {
        // Kept fire-and-forget (a ranking hiccup must not fail the publish), but a
        // failure means rankings are silently stale — surface it in Sentry so it
        // doesn't sit unnoticed.
        console.error('ranking recompute (publish) failed', e);
        captureException(e, { where: 'ranking.recompute', phase: 'publish', tournamentId, matchId: req.params.id });
      });

      // Fire-and-forget: notify each athlete their result is live, with stat line.
      void (async () => {
        try {
          const teams = await prisma.team.findMany({
            where: { id: { in: [trackerMatch.homeTeamId!, trackerMatch.awayTeamId!] } },
            select: { id: true, name: true },
          });
          const nameOf = (id: string) => teams.find((t) => t.id === id)?.name ?? 'Team';
          const stats = playerStats as { userId: string; stats?: Record<string, number> }[];
          await fanoutMatchResult({
            tournamentId, sport,
            homeName: nameOf(trackerMatch.homeTeamId!), awayName: nameOf(trackerMatch.awayTeamId!),
            homeScore: trackerMatch.homeScore, awayScore: trackerMatch.awayScore,
            playerStats: stats,
          });
          // First-timers also get "your Performance Card is now live".
          await fanoutStatsVerified({ tournamentId, sport, matchId: platformMatchId!, playerIds: stats.map((p) => p.userId) });
        } catch (e) { console.error('match-result notify failed', e); }
      })();
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
  requireTournamentAccess(fromTrackerMatchId),
  validate({ params: IdParam }),
  async (req: AuthRequest, res: Response) => {
    try {
      const trackerMatch = await prisma.trackerMatch.findUnique({
        where: { id: req.params.id as string },
        include: { session: { select: { tournamentId: true } } },
      });
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
          // Deleting the platform Match cascades its per-player stat rows away.
          await tx.match.deleteMany({ where: { id: trackerMatch.publishedMatchId } });
        }
        await tx.trackerMatch.update({
          where: { id: trackerMatch.id },
          data: { status: 'COMPLETED', publishedMatchId: null },
        });
      });

      res.json({ unpublished: true });

      // The removed stats must drop out of the rankings too. Fire-and-forget.
      const tournamentId = trackerMatch.session?.tournamentId;
      if (tournamentId) {
        void recalculateTournamentRankings(tournamentId).catch((e) => {
          console.error('ranking recompute (unpublish) failed', e);
          captureException(e, { where: 'ranking.recompute', phase: 'unpublish', tournamentId, matchId: req.params.id });
        });
      }
    } catch (err) {
      console.error('Unpublish tracker match error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// ─── Box score for a fixture nobody tracked ──────────────────────────────────
//
// The draw already knows this fixture: its teams, its round, when it was meant to
// be played. If it never got tracked — no scorer, no signal, or it was simply
// played before anyone opened the tracker — the organiser types the scoresheet in
// here instead, straight off the fixtures list.
//
// The result is indistinguishable from a tracked publish: the same platform Match,
// the same per-player stat rows on profiles, the same ranking recompute. The only
// difference is where the numbers came from, recorded as Match.statsSource.
//
// This is the same pipeline as the tournament-level box score endpoints
// (POST /tournaments/:id/box-scores); it differs only in being ANCHORED to an
// existing TrackerMatch, so the fixture flips to PUBLISHED and shows its score in
// the list rather than a second, parallel match appearing alongside it.

/** Load the fixture + its session, and check it can take a manual box score. */
async function boxScoreFixture(trackerMatchId: string) {
  const trackerMatch = await prisma.trackerMatch.findUnique({
    where: { id: trackerMatchId },
    include: { session: { select: { tournamentId: true, sport: true, roster: true } } },
  });
  if (!trackerMatch) throw new BoxScoreError('Fixture not found', 'NOT_FOUND');
  if (!trackerMatch.homeTeamId || !trackerMatch.awayTeamId) {
    throw new BoxScoreError('This fixture has no teams assigned yet', 'NO_TEAMS');
  }
  if (!BOX_SCORE_SPORTS.has(trackerMatch.session.sport)) {
    throw new BoxScoreError(`Box scores aren't supported for ${trackerMatch.session.sport} yet`, 'UNSUPPORTED_SPORT');
  }

  // A fixture already PUBLISHED from live tracking belongs to the tracker. Its
  // numbers came from the event log, and un-publishing is the documented way to
  // change them — letting a box score overwrite them here would discard that log
  // while leaving the fixture looking tracked.
  if (trackerMatch.publishedMatchId) {
    const existing = await prisma.match.findUnique({
      where: { id: trackerMatch.publishedMatchId },
      select: { statsSource: true },
    });
    if (existing && existing.statsSource !== 'MANUAL') {
      throw new BoxScoreError(
        'This match was scored in the live tracker. Un-publish it first if you need to replace the result with a box score.',
        'TRACKED_MATCH',
      );
    }
  }
  return trackerMatch;
}

// GET /api/tracker/matches/:id/box-score — the entry form's starting point: both
// rosters, plus whatever box score has already been entered for this fixture.
//
// Rosters come from the team membership (the authority the write path validates
// against), enriched with jersey numbers from the session's roster snapshot — the
// numbers a scorer already typed, so the sheet reads like the one on the table.
router.get(
  '/matches/:id/box-score',
  requireTournamentAccess(fromTrackerMatchId),
  validate({ params: IdParam }),
  async (req: AuthRequest, res: Response) => {
    try {
      const trackerMatch = await boxScoreFixture(req.params.id as string);
      const { sport } = trackerMatch.session;

      // Existing rows, when this fixture has been box-scored before.
      const rows = trackerMatch.publishedMatchId
        ? await loadStatRows(sport, trackerMatch.publishedMatchId)
        : [];
      const byUser = new Map(rows.map((r) => [r.userId, r]));
      const numbers = jerseyMap(trackerMatch.session.roster);

      const teams = await prisma.team.findMany({
        where: { id: { in: [trackerMatch.homeTeamId!, trackerMatch.awayTeamId!] } },
        select: {
          id: true, name: true,
          members: {
            select: { userId: true, user: { select: { id: true, name: true, position: true } } },
            orderBy: { invitedAt: 'asc' },
          },
        },
      });
      const sideFor = (teamId: string) => {
        const team = teams.find((x) => x.id === teamId);
        return (team?.members ?? []).map((m) => ({
          userId: m.userId,
          name: m.user.name,
          position: m.user.position,
          number: numbers.get(m.userId) ?? null,
          // No stat row ⇒ DNP. On a fixture never box-scored this makes every
          // player start as DNP, which is the right blank sheet: the organiser
          // marks who actually played rather than un-marking who didn't.
          played: byUser.has(m.userId),
          stats: byUser.get(m.userId) ?? null,
        }));
      };

      res.json({
        fixture: {
          id: trackerMatch.id,
          homeTeamId: trackerMatch.homeTeamId,
          awayTeamId: trackerMatch.awayTeamId,
          homeTeamName: teams.find((t) => t.id === trackerMatch.homeTeamId)?.name ?? 'Home',
          awayTeamName: teams.find((t) => t.id === trackerMatch.awayTeamId)?.name ?? 'Away',
          round: trackerMatch.round,
          court: trackerMatch.court,
          scheduledAt: trackerMatch.scheduledAt,
          status: trackerMatch.status,
          alreadyEntered: rows.length > 0,
        },
        sport,
        home: sideFor(trackerMatch.homeTeamId!),
        away: sideFor(trackerMatch.awayTeamId!),
      });
    } catch (error) {
      if (error instanceof BoxScoreError) {
        res.status(error.code === 'NOT_FOUND' ? 404 : error.code === 'TRACKED_MATCH' ? 409 : 400)
          .json({ error: error.message, code: error.code });
        return;
      }
      console.error('Load fixture box score error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// POST /api/tracker/matches/:id/box-score — publish (or correct) the box score for
// this fixture. Idempotent on re-entry: it updates the same platform Match rather
// than creating another, so correcting a sheet never leaves a duplicate result.
router.post(
  '/matches/:id/box-score',
  requireTournamentAccess(fromTrackerMatchId),
  validate({ params: IdParam, body: FixtureBoxScoreBody }),
  async (req: AuthRequest, res: Response) => {
    try {
      const trackerMatch = await boxScoreFixture(req.params.id as string);
      const { tournamentId, sport } = trackerMatch.session;
      const homeTeamId = trackerMatch.homeTeamId!;
      const awayTeamId = trackerMatch.awayTeamId!;
      const b = req.body as {
        home: { userId: string; played: boolean; stats?: Record<string, number> }[];
        away: { userId: string; played: boolean; stats?: Record<string, number> }[];
      };

      // Every player must be on the roster of the side they're listed under —
      // otherwise stats would land in the career totals and rankings of someone
      // who never played this match.
      await assertBoxScoreRosters(tournamentId, homeTeamId, awayTeamId, b.home, b.away);

      const result = await publishBoxScore({
        tournamentId, sport,
        homeTeamId, awayTeamId,
        boxScore: { home: b.home, away: b.away },
        // The fixture owns the when/where; a box score supplies numbers, not
        // scheduling. Falling back to now only when the draw never set a date.
        matchDate: trackerMatch.scheduledAt ?? new Date(),
        round: trackerMatch.round,
        court: trackerMatch.court,
        enteredById: req.user!.userId,
        // Present when re-entering — updates in place instead of duplicating.
        matchId: trackerMatch.publishedMatchId ?? undefined,
      });

      // Flip the fixture itself, so the list shows the score and PUBLISHED
      // exactly as it would for a tracked match.
      await prisma.trackerMatch.update({
        where: { id: trackerMatch.id },
        data: {
          status: 'PUBLISHED',
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          publishedMatchId: result.matchId,
        },
      });

      bustTournament(tournamentId);
      logger.info('tracker.box_score_published', {
        tournamentId, trackerMatchId: trackerMatch.id, matchId: result.matchId,
        by: req.user!.userId, players: result.playerCount,
        corrected: !!trackerMatch.publishedMatchId,
      });
      res.json({ published: true, ...result });

      // Fire-and-forget — the stats are already written; a notification failure
      // must not turn a successful publish into an error.
      void notifyBoxScorePublished({
        tournamentId, sport, homeTeamId, awayTeamId,
        homeScore: result.homeScore, awayScore: result.awayScore,
        matchId: result.matchId,
        playerStats: toPlayerStats(sport, { home: b.home, away: b.away }),
      }).catch((e) => console.error('fixture box score notify failed', e));
    } catch (error) {
      if (error instanceof BoxScoreError) {
        res.status(error.code === 'NOT_FOUND' ? 404 : error.code === 'TRACKED_MATCH' ? 409 : 400)
          .json({ error: error.message, code: error.code, field: error.field });
        return;
      }
      console.error('Publish fixture box score error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export default router;
