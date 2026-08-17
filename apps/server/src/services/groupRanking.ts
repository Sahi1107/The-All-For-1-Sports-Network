// ─────────────────────────────────────────────────────────────────────────────
// GROUP CLASSIFICATION — breaking ties on head-to-head results
//
// Two teams on the same record are not separated the same way in every sport,
// and getting it wrong decides who plays a semi-final.
//
// FOOTBALL (and the default here) follows the FIFA group convention: overall
// goal difference, then goals scored. A team that won by a lot against everyone
// ranks above a team that beat it narrowly.
//
// BASKETBALL follows FIBA, which inverts that priority: what matters first is
// what the tied teams did TO EACH OTHER. Rank on the mini round-robin played
// between the tied teams only —
//
//   1. games won among the tied teams
//   2. point difference in those same games
//   3. points scored in those same games
//
// — and only if that separates nobody do overall figures decide.
//
// The consequence is deliberate and looks wrong until you know the rule: a team
// with a far better overall difference can finish BELOW one it lost to, because
// blowouts against the bottom of the group are not supposed to buy a seed.
//
// THE RE-APPLICATION RULE carries the subtlety. When the mini-table separates
// SOME but not all of the tied teams, the procedure restarts for each set still
// tied — recomputed over only the games between the teams that remain. A team
// that has been separated out must not keep influencing the group it left, so
// the sub-table is genuinely rebuilt rather than filtered. That is what the
// recursion below is doing.
// ─────────────────────────────────────────────────────────────────────────────

/** The standings fields ranking needs. Both tracker and public tables satisfy it. */
export interface RankableRow {
  teamId: string;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
}

export interface RankableMatch {
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeScore: number;
  awayScore: number;
  status: string;
}

const isPlayed = (status: string): boolean => status === 'COMPLETED' || status === 'PUBLISHED';

/**
 * Disciplines whose ties are decided on head-to-head results before overall
 * figures.
 *
 * Basketball only, for now: FIBA is explicit about it, and it is the sport whose
 * group tables here actually reach a knockout. Football keeps the FIFA ordering
 * it already had — changing that quietly would re-rank finished tournaments in a
 * sport nobody asked about.
 *
 * BOTH basketball codes. The blowout argument applies to a game played to 21
 * exactly as it does to one played to 80, and FIBA 3x3 breaks ties head-to-head
 * as well.
 */
export function usesHeadToHeadTiebreak(discipline?: string | null): boolean {
  return discipline === 'BASKETBALL' || discipline === 'BASKETBALL_3X3';
}

/**
 * League-table points for one result, by discipline.
 *
 * 3x3 is the odd one out and deliberately so: FIBA 3x3 awards TWO for a win and
 * ONE for a loss, because a side that turns up and loses must finish above one
 * that forfeits — a distinction 3-1-0 cannot draw, since it pays a walkover and
 * a one-point defeat the same nothing.
 *
 * The consequence to expect in a 3x3 table: every side that plays gains points,
 * so the points column separates teams less than a 3-1-0 league's does and the
 * head-to-head tiebreak below does correspondingly more of the work. That is the
 * rule working, not the table failing to sort.
 */
export function resultPoints(
  discipline: string | null | undefined,
  result: 'win' | 'draw' | 'loss',
): number {
  if (discipline === 'BASKETBALL_3X3') return result === 'win' ? 2 : 1;
  return result === 'win' ? 3 : result === 'draw' ? 1 : 0;
}

/** Overall ordering: record, then how they did across the whole group. */
function byOverall(a: RankableRow, b: RankableRow): number {
  return b.points - a.points
    || b.goalDifference - a.goalDifference
    || b.goalsFor - a.goalsFor;
}

/** Split a sorted list into runs whose `key` is identical. */
function blocksBy<T>(sorted: T[], key: (row: T) => string): T[][] {
  const out: T[][] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && key(sorted[j]) === key(sorted[i])) j++;
    out.push(sorted.slice(i, j));
    i = j;
  }
  return out;
}

/**
 * Order teams that share a record, on the games they played against each other.
 * Recursive by design — see THE RE-APPLICATION RULE above.
 */
function headToHeadOrder<T extends RankableRow>(tied: T[], matches: RankableMatch[]): T[] {
  if (tied.length <= 1) return tied;

  // The mini round-robin: ONLY games in which both sides are still tied.
  //
  // WINS, not league points. FIBA's first criterion is "games won among the tied
  // teams", and counting wins is the only reading that survives both codes: 3x3
  // pays a point for a LOSS, so a mini-table scored on league points would give
  // a team credit for turning up and losing to the very side it is tied with —
  // and where the tied teams have played unequal numbers of games against each
  // other (an unfinished group), those participation points do not cancel and
  // can invert the order outright. For 5v5 this changes nothing: basketball has
  // no draws, so 3-1-0 was already three times the win count.
  const ids = new Set(tied.map((t) => t.teamId));
  const mini = new Map(tied.map((t) => [t.teamId, { wins: 0, for: 0, against: 0 }]));
  for (const m of matches) {
    if (!isPlayed(m.status) || !m.homeTeamId || !m.awayTeamId) continue;
    if (!ids.has(m.homeTeamId) || !ids.has(m.awayTeamId)) continue;
    const h = mini.get(m.homeTeamId)!;
    const a = mini.get(m.awayTeamId)!;
    h.for += m.homeScore; h.against += m.awayScore;
    a.for += m.awayScore; a.against += m.homeScore;
    if (m.homeScore > m.awayScore) h.wins += 1;
    else if (m.awayScore > m.homeScore) a.wins += 1;
  }

  const stat = (row: T) => mini.get(row.teamId)!;
  // The criteria, in order. Applied ONE AT A TIME — that is the whole point of
  // the re-application rule. The moment a criterion separates anyone, teams
  // still level with each other go back to the START of the procedure over a
  // rebuilt sub-table; we do NOT carry on down this list with figures that
  // include a team which has already been separated out.
  const CRITERIA: ((row: T) => number)[] = [
    (row) => stat(row).wins,                      // games won among the tied teams
    (row) => stat(row).for - stat(row).against,   // point difference in those games
    (row) => stat(row).for,                       // points scored in those games
  ];

  for (const value of CRITERIA) {
    const sorted = [...tied].sort((a, b) => value(b) - value(a));
    const groups = blocksBy(sorted, (row) => String(value(row)));
    if (groups.length === 1) continue; // separated nobody — try the next criterion
    return groups.flatMap((g) => (g.length > 1 ? headToHeadOrder(g, matches) : g));
  }

  // Head-to-head told us nothing — the tied teams are level on all three, or
  // they have not played each other yet (a group still in progress). Overall
  // figures decide.
  return [...tied].sort(
    (a, b) => b.goalDifference - a.goalDifference
      || b.goalsFor - a.goalsFor
      // Last resort: a stable, deterministic order. FIBA draws lots here; a
      // table that reshuffles itself between two reads would be worse than
      // arbitrary-but-fixed, and the organiser can still order it by hand.
      || a.teamId.localeCompare(b.teamId),
  );
}

/**
 * Rank one group (or league) table. `matches` must be the group's own matches —
 * head-to-head is meaningless across groups, whose teams never meet.
 */
export function orderGroup<T extends RankableRow>(
  rows: T[],
  matches: RankableMatch[],
  sport?: string | null,
): T[] {
  const sorted = [...rows].sort(byOverall);
  if (!usesHeadToHeadTiebreak(sport)) return sorted;

  // Teams are tied when their RECORD is level; everything below that is a
  // tiebreak, so re-decide each block of equal points from scratch.
  return blocksBy(sorted, (r) => String(r.points))
    .flatMap((block) => (block.length > 1 ? headToHeadOrder(block, matches) : block));
}
