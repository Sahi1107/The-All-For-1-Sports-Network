import prisma from '../../config/db';
import { notify } from './notify';

// Fan-out helpers for live-tournament notifications. Kept out of the route
// handlers so they stay readable; each is fire-and-forget from the caller.

interface StatEntry { userId: string; stats?: Record<string, number> }

/** Short "you: 2 goals, 1 assist" line from a player's match stats. */
export function statLine(sport: string, stats: Record<string, number> = {}): string {
  const parts: string[] = [];
  const add = (v: number | undefined, unit: string) => { if (v && v > 0) parts.push(`${v} ${unit}${v === 1 ? '' : 's'}`); };
  if (sport === 'FOOTBALL') { add(stats.goals, 'goal'); add(stats.assists, 'assist'); }
  else if (sport === 'BASKETBALL') {
    if (stats.points) parts.push(`${stats.points} pts`);
    if (stats.rebounds) parts.push(`${stats.rebounds} reb`);
    if (stats.assists) parts.push(`${stats.assists} ast`);
  } else if (sport === 'CRICKET') {
    if (stats.runs) parts.push(`${stats.runs} runs`);
    if (stats.wickets) parts.push(`${stats.wickets} wkts`);
  }
  return parts.join(', ');
}

const fixturesLink = (tournamentId: string) => `/tournaments/${tournamentId}?tab=fixtures`;

/** "Your match result is live" — to each athlete who played, with their stat line. */
export async function fanoutMatchResult(opts: {
  tournamentId: string; sport: string;
  homeName: string; awayName: string; homeScore: number | null; awayScore: number | null;
  playerStats: StatEntry[];
}): Promise<void> {
  const label = `${opts.homeName} ${opts.homeScore ?? 0}–${opts.awayScore ?? 0} ${opts.awayName}`;
  const link = fixturesLink(opts.tournamentId);
  await Promise.all(opts.playerStats.map((p) => {
    const line = statLine(opts.sport, p.stats ?? {});
    return notify({
      recipientId: p.userId,
      type: 'MATCH_RESULT_PUBLISHED',
      ctx: { entityName: label, extra: line ? `you: ${line}` : undefined },
      referenceId: opts.tournamentId,
      link,
    });
  }));
}

/** "The draw is out" — to every member of every registered team. */
export async function fanoutDrawPublished(opts: { tournamentId: string; tournamentName: string; playerIds: string[] }): Promise<void> {
  const link = fixturesLink(opts.tournamentId);
  await Promise.all([...new Set(opts.playerIds)].map((id) => notify({
    recipientId: id, type: 'DRAW_PUBLISHED', ctx: { entityName: opts.tournamentName }, referenceId: opts.tournamentId, link,
  })));
}

/** "Fixtures scheduled" — to each player, pointed at their next match time + court. */
export async function fanoutFixturesScheduled(opts: {
  tournamentId: string; tournamentName: string; perUser: { userId: string; next?: string }[];
}): Promise<void> {
  const link = fixturesLink(opts.tournamentId);
  await Promise.all(opts.perUser.map((u) => notify({
    recipientId: u.userId, type: 'FIXTURES_SCHEDULED', ctx: { entityName: opts.tournamentName, extra: u.next }, referenceId: opts.tournamentId, link,
  })));
}

/** Format a scheduled match slot in IST, e.g. "4:00 PM · Court 2". */
export function slotLabel(scheduledAt: Date | null, court: string | null): string | undefined {
  if (!scheduledAt) return undefined;
  const t = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' }).format(scheduledAt);
  return court ? `${t} · ${court}` : t;
}

// ── Stats verified (first Performance Card) ──────────────────────────────────

/** Pure: which players are getting verified stats for the FIRST time. */
export function firstTimers(allIds: string[], priorIds: Set<string>): string[] {
  return [...new Set(allIds)].filter((id) => !priorIds.has(id));
}

async function priorStatUserIds(sport: string, matchId: string, playerIds: string[]): Promise<Set<string>> {
  if (playerIds.length === 0) return new Set();
  const where = { userId: { in: playerIds }, matchId: { not: matchId } };
  const select = { userId: true } as const;
  let rows: { userId: string }[] = [];
  if (sport === 'FOOTBALL') rows = await prisma.footballStats.findMany({ where, select, distinct: ['userId'] });
  else if (sport === 'BASKETBALL') rows = await prisma.basketballStats.findMany({ where, select, distinct: ['userId'] });
  return new Set(rows.map((r) => r.userId));
}

/**
 * Fire STATS_VERIFIED only for athletes getting verified stats for the FIRST
 * time — "your Performance Card is now live". Subsequent matches fire
 * MATCH_RESULT_PUBLISHED instead, so the two never double up.
 */
export async function fanoutStatsVerified(opts: { tournamentId: string; sport: string; matchId: string; playerIds: string[] }): Promise<void> {
  const prior = await priorStatUserIds(opts.sport, opts.matchId, opts.playerIds);
  const newcomers = firstTimers(opts.playerIds, prior);
  await Promise.all(newcomers.map((id) => notify({
    recipientId: id,
    type: 'STATS_VERIFIED',
    ctx: { extra: 'Your stats are verified — your Performance Card is now live' },
    link: `/profile/${id}`,
  })));
}

// ── Match starting soon (scheduled sweep) ────────────────────────────────────

interface RosterTeam { teamId: string; name?: string; players?: { userId?: string }[] }

/**
 * Sweep upcoming fixtures and remind each player their match starts soon (once
 * per match — deduped via TrackerMatch.startNotifiedAt). Called by Cloud
 * Scheduler every ~15 min during an event.
 */
export async function sweepMatchStartingSoon(withinMinutes = 45): Promise<{ matches: number; notified: number }> {
  const now = new Date();
  const until = new Date(now.getTime() + withinMinutes * 60_000);
  const matches = await prisma.trackerMatch.findMany({
    where: {
      status: 'SCHEDULED',
      startNotifiedAt: null,
      scheduledAt: { gte: now, lte: until },
      homeTeamId: { not: null },
      awayTeamId: { not: null },
    },
    include: { session: { select: { tournamentId: true, roster: true } } },
  });

  let notified = 0;
  for (const m of matches) {
    try {
      const roster = (m.session.roster as RosterTeam[] | null) ?? [];
      const home = roster.find((t) => t.teamId === m.homeTeamId);
      const away = roster.find((t) => t.teamId === m.awayTeamId);
      const label = `${home?.name ?? 'Your team'} vs ${away?.name ?? 'opponents'}`;
      const slot = slotLabel(m.scheduledAt, m.court);
      const link = fixturesLink(m.session.tournamentId);
      const players = [...(home?.players ?? []), ...(away?.players ?? [])].map((p) => p.userId).filter(Boolean) as string[];

      await Promise.all([...new Set(players)].map((id) => notify({
        recipientId: id, type: 'MATCH_STARTING_SOON', ctx: { entityName: label, extra: slot }, referenceId: m.session.tournamentId, link,
      })));
      await prisma.trackerMatch.update({ where: { id: m.id }, data: { startNotifiedAt: new Date() } });
      notified += players.length;
    } catch { /* skip this match, continue the sweep */ }
  }
  return { matches: matches.length, notified };
}
