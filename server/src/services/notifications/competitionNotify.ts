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
