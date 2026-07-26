import type { TrackerSession, TrackerMatch } from '../types';

/** teamId → team name, from the session roster. */
export function teamNames(session: TrackerSession): (id: string | null) => string {
  const map = new Map<string, string>();
  (session.roster ?? []).forEach((t) => map.set(t.teamId, t.name));
  return (id) => (id ? map.get(id) ?? 'TBD' : 'TBD');
}

export const DONE = (m: TrackerMatch) => m.status === 'COMPLETED' || m.status === 'PUBLISHED';

/** A bye: an auto-resolved knockout slot with exactly one team (the other is a
 *  null opponent). A real completed match always has both teams, and a match
 *  still awaiting its second feeder is SCHEDULED — so DONE + exactly-one-team is
 *  unambiguous. The lone team has already been advanced into its parent slot. */
export const isBye = (m: Pick<TrackerMatch, 'status' | 'homeTeamId' | 'awayTeamId'>) =>
  (m.status === 'COMPLETED' || m.status === 'PUBLISHED') && (!!m.homeTeamId !== !!m.awayTeamId);

/** Ordering used when laying out fixtures / progress by stage. */
export const STAGE_ORDER = ['group', 'league', 'r32', 'r16', 'qf', 'sf', 'third_place', 'final'];

export function stageSort(a: string, b: string) {
  return STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b);
}
