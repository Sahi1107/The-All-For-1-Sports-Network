// Pairing the opening knockout round. Mirror of the seedPositions /
// seedFirstRound pair in server/src/services/trackerDraw.ts — the real tracker
// is seeded server-side, this drives the offline demo, and a demo that draws a
// different bracket from the product teaches the wrong thing.

/**
 * Standard single-elimination seed positions for a bracket with `size` opening
 * places (a power of two). `positions[i]` is the 1-based SEED in position i, and
 * consecutive positions are a tie:
 *
 *   size 4 → [1, 4, 2, 3]          ties: 1v4, 2v3
 *   size 8 → [1, 8, 4, 5, 2, 7, 3, 6]
 *
 * Every seed s in a bracket of n is joined by n+1−s, which keeps the top seeds in
 * opposite halves and — given qualifiers ranked winners-first — pairs each group
 * winner with a runner-up from a DIFFERENT group.
 */
export function seedPositions(size: number): number[] {
  let arr = [1];
  while (arr.length < size) {
    const n = arr.length * 2;
    const next: number[] = [];
    for (const s of arr) next.push(s, n + 1 - s);
    arr = next;
  }
  return arr;
}

export interface Tie { home: string | null; away: string | null }

/** Swap opponents until no tie is two teams out of the same group. A tie no swap
 *  can fix is left alone (one group has no cross-group pairing to find). */
function repairSameGroupTies(ties: Tie[], groupOf: Map<string, string>): void {
  const clash = (t: Tie): boolean => {
    if (!t.home || !t.away) return false;
    const g = groupOf.get(t.home);
    return !!g && g === groupOf.get(t.away);
  };
  for (let i = 0; i < ties.length; i++) {
    if (!clash(ties[i])) continue;
    for (let j = 0; j < ties.length; j++) {
      if (i === j || !ties[j].away) continue;
      const a = ties[i].away, b = ties[j].away;
      ties[i].away = b; ties[j].away = a;
      if (!clash(ties[i]) && !clash(ties[j])) break;
      ties[i].away = a; ties[j].away = b; // no good — put them back
    }
  }
}

/**
 * Pair `teamOrder` (SEED ORDER, best first — not pre-paired) into `slotCount`
 * opening ties. Surplus bracket places become byes, which land on the best-placed
 * qualifiers because they sit opposite the highest seed numbers.
 */
export function pairFirstRound(
  teamOrder: string[],
  slotCount: number,
  groupOf?: Map<string, string>,
): Tie[] {
  const teams = teamOrder.filter(Boolean);
  const S = Math.max(1, slotCount);
  const positions = seedPositions(S * 2);
  const teamAt = (seed: number): string | null => teams[seed - 1] ?? null;

  const ties: Tie[] = [];
  for (let i = 0; i < S; i++) {
    const home = teamAt(positions[i * 2]);
    const away = teamAt(positions[i * 2 + 1]);
    // A bye reads as "this team, no opponent", so never leave the empty side first.
    ties.push(home ? { home, away } : { home: away, away: null });
  }
  if (groupOf) repairSameGroupTies(ties, groupOf);
  return ties;
}

/** teamId → the group it qualified from, so a draw can keep group rivals apart. */
export function groupOfTeams(groups: { id: string; teamIds: string[] }[]): Map<string, string> {
  const map = new Map<string, string>();
  groups.forEach((g) => g.teamIds.forEach((id) => map.set(id, g.id)));
  return map;
}
