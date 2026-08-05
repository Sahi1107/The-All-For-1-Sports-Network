import prismaDefault from '../config/db';

/**
 * The roster lifecycle: a team's roster is editable right up until the team
 * plays its first match, then it locks (stats get recorded against that exact
 * roster, so it must stop moving). The cutoff is deliberately the FIRST MATCH
 * PLAYED — not registration closing, not the draw being generated. An organiser
 * can therefore register a team by name, fill the squad over time, and keep
 * correcting it until tip-off.
 *
 * A match counts as "played" once it is no longer merely SCHEDULED — i.e. it is
 * live (IN_PROGRESS) or finished (COMPLETED / PUBLISHED). Genuine stat
 * corrections after that happen through the tracker's own correction / un-publish
 * paths, which are unaffected by this roster lock.
 */
export const ROSTER_LOCK_STATUSES = ['IN_PROGRESS', 'COMPLETED', 'PUBLISHED'] as const;

/** Pure: does this set of a team's match statuses mean the roster is locked? */
export function isRosterLockedByMatches(statuses: Array<string | null | undefined>): boolean {
  return statuses.some((s) => (ROSTER_LOCK_STATUSES as readonly string[]).includes(s ?? ''));
}

/** Pure: a team needs organiser attention when it has too few players to field. */
export function rosterNeedsAttention(memberCount: number, minRosterSize: number | null | undefined): boolean {
  if (memberCount === 0) return true;
  if (minRosterSize != null && memberCount < minRosterSize) return true;
  return false;
}

/** Pure: whether a roster satisfies the tournament minimum (checked at first
 *  match, never at registration). No minimum configured ⇒ always satisfied. */
export function rosterMeetsMinimum(memberCount: number, minRosterSize: number | null | undefined): boolean {
  return minRosterSize == null || memberCount >= minRosterSize;
}

/** The slice of Prisma this needs — injectable so callers/tests don't need a DB. */
export interface RosterLockDb {
  trackerMatch: {
    findFirst(args: any): Promise<{ id: string } | null>;
  };
}

/**
 * Has this team played its first match yet? True once any tracker match it is in
 * (home or away) has left SCHEDULED. This is the roster-lock gate the roster
 * add/remove endpoints consult server-side.
 */
export async function teamRosterIsLocked(
  teamId: string,
  db: RosterLockDb = prismaDefault as unknown as RosterLockDb,
): Promise<boolean> {
  const played = await db.trackerMatch.findFirst({
    where: {
      status: { in: [...ROSTER_LOCK_STATUSES] },
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
    },
    select: { id: true },
  });
  return played !== null;
}

// ─── Roster snapshot reconciliation ──────────────────────────────────────────
// The tracker scores from TrackerSession.roster, a JSON snapshot frozen when the
// draw was generated. A player added to a team afterwards was therefore invisible
// to the scorer, and the only fix was regenerating the whole draw. These pure
// helpers let the tracker reconcile that snapshot on match load instead.

export type RosterSnapshotTeam = {
  teamId: string;
  name: string;
  players: { userId: string; name: string; position: string | null; number: number | null }[];
};

/** Stable signature of a roster snapshot — lets the caller write (and bust
 *  caches) only when something actually changed, not on every match open. */
export function rosterSignature(r: unknown): string {
  return JSON.stringify(
    ((r as RosterSnapshotTeam[] | null) ?? [])
      .map((t) => ({
        id: t.teamId,
        name: t.name,
        p: (t.players ?? []).map((x) => `${x.userId}:${x.number ?? ''}:${x.name}:${x.position ?? ''}`).sort(),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  );
}

/**
 * Merge freshly-read team members INTO the stored snapshot.
 *
 * ADDITIVE ON PURPOSE. Replacing the snapshot with a straight rebuild would drop
 * anyone no longer an ACCEPTED member — and if that player had already played,
 * their recorded stats live in TrackerMatch.state keyed by userId, so their row
 * would vanish from the tracker while the numbers stayed stranded in the state
 * blob, still counted in scores and exports. Keeping a departed player visible is
 * a far better failure than orphaning what they recorded. Deliberate removal goes
 * through the withdraw / correction tools, which clean up properly.
 */
export function mergeRoster(
  prev: RosterSnapshotTeam[],
  fresh: RosterSnapshotTeam[],
): RosterSnapshotTeam[] {
  const prevByTeam = new Map(prev.map((t) => [t.teamId, t]));
  const merged = fresh.map((t) => {
    const old = prevByTeam.get(t.teamId);
    if (!old) return t;
    const present = new Set(t.players.map((p) => p.userId));
    const carried = (old.players ?? []).filter((p) => !present.has(p.userId));
    return { ...t, players: [...t.players, ...carried] };
  });
  // A team that has left the registrations keeps its snapshot entry for the same
  // reason — its played matches still reference these players.
  const freshTeams = new Set(fresh.map((t) => t.teamId));
  for (const t of prev) if (!freshTeams.has(t.teamId)) merged.push(t);
  return merged;
}
