import prismaDefault from '../config/db';

/** The slice of Prisma deletionImpact needs — injectable so it unit-tests without a DB. */
export interface DeletionDb {
  tournament: { findUnique(args: any): Promise<{ id: string; name: string; status: string } | null> };
  team: { count(args: any): Promise<number> };
  tournamentTeam: { count(args: any): Promise<number> };
  match: { count(args: any): Promise<number> };
  basketballStats: { findMany(args: any): Promise<Array<{ userId: string }>> };
  footballStats: { findMany(args: any): Promise<Array<{ userId: string }>> };
  cricketStats: { findMany(args: any): Promise<Array<{ userId: string }>> };
  playerRanking: { count(args: any): Promise<number> };
  tournamentOrganizer: { count(args: any): Promise<number> };
}

/**
 * Tournament deletion — the destructive path, made explicit.
 *
 * Deleting a tournament cascades (DB-level) through: teams created inside it,
 * registrations, matches, per-player stats (all three sports), rankings, the
 * tracker session + its matches, organiser assignments and their audit rows.
 * Athlete Performance Cards aggregate LIVE from the stats tables, so the
 * verified record updates the moment the rows go — nothing is left pointing at
 * a tournament that no longer exists. (Athlete-authored PERFORMANCE posts are
 * their own social claims, not platform records — they are not touched.)
 *
 * Because published stats are real athlete data, deleting a tournament that has
 * any requires the caller to confirm by typing the tournament's exact name.
 */

export interface DeletionImpact {
  name: string;
  status: string;
  teams: number;
  registrations: number;
  matches: number;
  publishedMatches: number;
  statRows: number;
  playersAffected: number;
  rankings: number;
  organizers: number;
  hasPublishedData: boolean;
}

/** Everything the delete will destroy — shown in the confirmation, verbatim. */
export async function deletionImpact(
  tournamentId: string,
  prisma: DeletionDb = prismaDefault as unknown as DeletionDb,
): Promise<DeletionImpact | null> {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true, name: true, status: true },
  });
  if (!t) return null;

  const [teams, registrations, matches, publishedMatches, bb, fb, cr, rankings, organizers] = await Promise.all([
    prisma.team.count({ where: { tournamentId } }),
    prisma.tournamentTeam.count({ where: { tournamentId } }),
    prisma.match.count({ where: { tournamentId } }),
    prisma.match.count({ where: { tournamentId, status: 'COMPLETED' } }),
    prisma.basketballStats.findMany({ where: { tournamentId }, select: { userId: true } }),
    prisma.footballStats.findMany({ where: { tournamentId }, select: { userId: true } }),
    prisma.cricketStats.findMany({ where: { tournamentId }, select: { userId: true } }),
    prisma.playerRanking.count({ where: { tournamentId } }),
    prisma.tournamentOrganizer.count({ where: { tournamentId } }),
  ]);

  const statRows = bb.length + fb.length + cr.length;
  const playersAffected = new Set([...bb, ...fb, ...cr].map((r) => r.userId)).size;

  return {
    name: t.name, status: t.status,
    teams, registrations, matches, publishedMatches,
    statRows, playersAffected, rankings, organizers,
    hasPublishedData: statRows > 0 || publishedMatches > 0,
  };
}

export type DeleteDecision =
  | { ok: true }
  | { ok: false; status: 404 | 409; error: string; code?: string };

/**
 * Pure gate: a tournament with published data (real athlete records) may only be
 * deleted when the caller has typed the tournament's EXACT name. One without may
 * be deleted with a plain confirmation. Fails closed on a missing tournament.
 */
export function decideDeletion(input: {
  impact: DeletionImpact | null;
  confirmName?: string | null;
}): DeleteDecision {
  if (!input.impact) return { ok: false, status: 404, error: 'Tournament not found' };
  if (input.impact.hasPublishedData && input.confirmName !== input.impact.name) {
    return {
      ok: false,
      status: 409,
      code: 'CONFIRM_NAME_REQUIRED',
      error: 'This tournament has published results. Type its exact name to confirm deletion.',
    };
  }
  return { ok: true };
}
