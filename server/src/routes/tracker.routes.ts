import { Router, Response } from 'express';
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
  bracketAdvancements,
  groupRoundRobin,
  type BracketDef,
  type GroupDef,
} from '../services/trackerDraw';
import { derivePlayerStats } from '../services/trackerStats';
import { fanoutMatchResult, fanoutDrawPublished, fanoutFixturesScheduled, fanoutStatsVerified, slotLabel } from '../services/notifications/competitionNotify';
import { writeMatchPlayerStats } from '../services/matchStats';
import { recalculateTournamentRankings } from '../services/rankingService';
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
} from '../validation/tracker';

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
  requireTournamentAccess(fromParamTournamentId),
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
      const hasResults = (gid: string) => groupMatches.some((m) => m.groupId === gid && DONE_STATUS(m.status));
      const sortedKey = (ids: string[]) => [...ids].sort().join(',');

      const changedIds: string[] = [];
      const renamedOnly: GroupDef[] = [];
      for (const g of newGroups) {
        const old = oldById.get(g.id);
        const compChanged = !old || sortedKey(g.teamIds) !== sortedKey(old.teamIds);
        if (compChanged) {
          if (hasResults(g.id)) { res.status(400).json({ error: `Group "${g.name}" already has results — reset the draw to restructure it` }); return; }
          changedIds.push(g.id);
        } else if (old.name !== g.name) {
          renamedOnly.push(g);
        }
      }
      const removedIds = oldGroups.filter((o) => !newGroups.some((g) => g.id === o.id)).map((o) => o.id);
      for (const rid of removedIds) {
        if (hasResults(rid)) { res.status(400).json({ error: 'A removed group already has results — reset the draw instead' }); return; }
      }

      const roster = await buildRosterSnapshot(tournamentId, session.roster);
      let nextOrder = Math.max(0, ...session.matches.map((m) => m.orderIndex)) + 1;

      await prisma.$transaction(async (tx) => {
        const toDelete = [...changedIds, ...removedIds];
        if (toDelete.length) {
          await tx.trackerMatch.deleteMany({ where: { sessionId: session.id, stage: 'group', groupId: { in: toDelete } } });
        }
        for (const g of newGroups.filter((g) => changedIds.includes(g.id))) {
          const fx = groupRoundRobin(g, nextOrder);
          nextOrder += fx.length;
          if (fx.length) {
            await tx.trackerMatch.createMany({
              data: fx.map((f) => ({
                sessionId: session.id, stage: f.stage, round: f.round, groupId: f.groupId,
                orderIndex: f.orderIndex, homeTeamId: f.homeTeamId ?? null, awayTeamId: f.awayTeamId ?? null,
              })),
            });
          }
        }
        for (const g of renamedOnly) {
          await tx.trackerMatch.updateMany({ where: { sessionId: session.id, stage: 'group', groupId: g.id }, data: { round: g.name } });
        }
        await tx.trackerSession.update({ where: { id: session.id }, data: { groups: newGroups as object, roster: roster as object } });
      });

      res.json({ ok: true });
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

export default router;
