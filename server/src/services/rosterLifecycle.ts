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
