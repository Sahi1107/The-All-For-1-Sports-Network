import type { Prisma } from '@prisma/client';

/**
 * WHERE for the organiser roster "add existing player" search.
 *
 * Matches a name (case-insensitive) that is EITHER:
 *   1. already on a team IN THIS TOURNAMENT — a team created inside it
 *      (Team.tournamentId) or a team registered to it (TournamentTeam); or
 *   2. an admin/organiser-PROVISIONED profile that has not been claimed yet.
 *      `mustResetPassword` is set only by provisioning (the account is handed a
 *      temp password) and is cleared the first time the user changes it, so
 *      `true` means the player has never completed a login. This is what lets an
 *      organiser slot the roster shells they imported (e.g. via CSV) onto teams
 *      *before those players ever sign in* — the reported gap.
 *
 * It deliberately does NOT apply the public discovery gate (`discoverable` /
 * `guardianManaged`) so provisioned and guardian-managed (minor) players are
 * findable. Both branches are bounded: branch 1 to this tournament's
 * participants, branch 2 to unclaimed provisioned shells (never a real,
 * self-registered account — those always have mustResetPassword=false). So the
 * search can surface neither a private personal account nor anyone outside this
 * tournament who isn't a provisioned-but-unclaimed player. The endpoint is
 * additionally gated by requireTournamentAccess (this tournament's organiser or
 * an admin) and capped at a handful of results.
 */
export function tournamentPlayerSearchWhere(tournamentId: string, query: string): Prisma.UserWhereInput {
  return {
    name: { contains: query, mode: 'insensitive' },
    OR: [
      // (1) Already on a team in THIS tournament.
      {
        teamMemberships: {
          some: {
            team: {
              OR: [
                { tournamentId },                                        // team created inside the tournament
                { tournamentRegistrations: { some: { tournamentId } } }, // team registered to it
              ],
            },
          },
        },
      },
      // (2) A provisioned profile the organiser/admin created that hasn't signed
      //     in yet (temp password never changed). Restricted to player/coach
      //     roles — the only roles provisioning ever creates.
      { mustResetPassword: true, role: { in: ['ATHLETE', 'COACH'] } },
    ],
  };
}
