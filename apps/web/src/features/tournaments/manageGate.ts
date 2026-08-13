/**
 * The invariant, in one place: registration status limits what the PUBLIC can do
 * (self-register), never what an organiser can do to set up their own tournament.
 *
 * Draw generation, live tracking, roster editing, group editing — all of these
 * are management actions and must be available in every non-cancelled state,
 * including while registration is still open. This module is the single source
 * of truth both TournamentManage and the tracker launcher import, so the gate
 * can never drift back to being status-dependent in one place but not another.
 */

/** Only sports with a live tracker + automatic draw. */
export const TRACKER_SPORTS = new Set(['FOOTBALL', 'BASKETBALL']);

/** A cancelled tournament has no more setup to do; everything else is fair game. */
export function canManageDraw(status?: string | null): boolean {
  return !!status && status !== 'CANCELLED';
}

/** Registration open ⇒ late entries can still arrive after a draw is generated. */
export function isRegistrationOpen(status?: string | null): boolean {
  return status === 'UPCOMING' || status === 'REGISTRATION_OPEN';
}

/** Shown when a draw is generated (or offered) while registration is still open. */
export const LATE_ENTRY_WARNING =
  'Registration is still open. Teams that register after this draw is generated won’t be placed automatically — add them to a group in the draw editor, or reset the draw to include everyone. You can generate now and adjust later.';

/**
 * Registered teams not present in any group of the current draw — the late
 * entries that must stay visible and actionable, never silently stranded.
 * Group formats surface these in the group editor; other formats need a re-draw.
 */
export function unassignedTeamIds(
  registeredTeamIds: string[],
  groups: Array<{ teamIds: string[] }> | null | undefined,
): string[] {
  const assigned = new Set((groups ?? []).flatMap((g) => g.teamIds));
  return registeredTeamIds.filter((id) => !assigned.has(id));
}
