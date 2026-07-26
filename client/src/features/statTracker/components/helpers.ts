import type { TrackerSession, TrackerMatch } from '../types';

/** teamId → team name, from the session roster. */
export function teamNames(session: TrackerSession): (id: string | null) => string {
  const map = new Map<string, string>();
  (session.roster ?? []).forEach((t) => map.set(t.teamId, t.name));
  return (id) => (id ? map.get(id) ?? 'TBD' : 'TBD');
}

export const DONE = (m: TrackerMatch) => m.status === 'COMPLETED' || m.status === 'PUBLISHED';

/** Ordering used when laying out fixtures / progress by stage. */
export const STAGE_ORDER = ['group', 'league', 'r32', 'r16', 'qf', 'sf', 'third_place', 'final'];

export function stageSort(a: string, b: string) {
  return STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b);
}
