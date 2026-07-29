import type { Prisma } from '@prisma/client';

/**
 * WHERE for the organiser roster "add existing player" search.
 *
 * Scoped to players who are ALREADY ON A TEAM IN THIS TOURNAMENT — either a team
 * created inside it (Team.tournamentId) or a team registered to it
 * (TournamentTeam). It deliberately does NOT apply the public discovery gate
 * (`discoverable` / `guardianManaged`): an organiser must be able to find the
 * provisioned and guardian-managed (minor) players Sahil created for their
 * tournament and slot them onto teams.
 *
 * The safety rests entirely on this scope: because it's bounded to *this
 * tournament's* participants, it can never surface — and so can never be used to
 * enumerate — any private account outside the tournament. The endpoint that uses
 * it is additionally gated by requireTournamentAccess, so only that tournament's
 * organiser (or an admin) can call it at all.
 */
export function tournamentPlayerSearchWhere(tournamentId: string, query: string): Prisma.UserWhereInput {
  return {
    name: { contains: query, mode: 'insensitive' },
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
  };
}
