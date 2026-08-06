import prisma from '../config/db';
import { genderFromCategory } from './bulkProvision';

/**
 * Set gender on players who have none, from the tournament's category.
 *
 * The rankings split men's from women's on User.gender, which is nullable and
 * often unset on provisioned or organiser-created accounts — those players end up
 * on NEITHER board despite having published results. Having played a men's or
 * women's tournament is direct evidence of the category, so publishing settles it.
 *
 * Deliberately narrow: only fills a null (never overwrites an athlete's own
 * value), and MIXED/OPEN categories imply nothing so they're skipped. Non-fatal —
 * a failure here must not fail a publish that already wrote its stats.
 *
 * Shared by BOTH publish paths (the live tracker and manual box scores) so a
 * hand-entered result can't leave players off the boards that a tracked one puts
 * them on.
 */
export async function backfillGenderFromTournament(tournamentId: string, userIds: string[]): Promise<void> {
  if (!userIds.length) return;
  try {
    const t = await prisma.tournament.findUnique({
      where: { id: tournamentId }, select: { genderCategory: true },
    });
    const gender = genderFromCategory(t?.genderCategory ?? null);
    if (!gender) return;
    await prisma.user.updateMany({
      where: { id: { in: userIds }, gender: null },
      data: { gender },
    });
  } catch (err) {
    console.error(`[stats] gender backfill failed for tournament ${tournamentId}:`, err);
  }
}
