/**
 * Radar foundation — career-stat totals.
 *
 * Per-match stat rows (BasketballStats / FootballStats / CricketStats, one row
 * per match+user) are summed into a player's CAREER totals. Radar filters and
 * ranks on these totals ("20+ career points", "10+ goals").
 *
 * The current Scout Copilot engine sums stats in JS after a `take: 200` fetch,
 * which silently drops any athlete past the 200th row on stat queries. The DB
 * helpers here aggregate with a single `groupBy` across ALL matching rows — no
 * cap, computed database-side — so the eventual engine (Step 4) can rely on
 * correct totals at any scale. The pure helpers carry no DB dependency so they
 * unit-test directly; prisma is imported lazily inside the DB helpers.
 */

/** Sports that have match-level stat tables to aggregate. */
export type StatSport = 'BASKETBALL' | 'FOOTBALL' | 'CRICKET';

/**
 * The summable numeric columns per sport — the canonical career metrics. Kept in
 * sync with the Prisma stat models. Rates (strike rate, per-game averages) are a
 * ranking concern (Step 7); Radar derives them from these totals rather than
 * storing them, so here we only sum raw counts + the float time columns.
 */
export const CAREER_STAT_FIELDS = {
  BASKETBALL: ['points', 'rebounds', 'assists', 'steals', 'blocks', 'threePointers', 'freeThrows', 'turnovers', 'minutesPlayed'],
  FOOTBALL:   ['goals', 'assists', 'shots', 'passes', 'tackles', 'saves', 'yellowCards', 'redCards', 'minutesPlayed'],
  CRICKET:    ['runs', 'ballsFaced', 'fours', 'sixes', 'wickets', 'runsConceded', 'catches', 'runOuts', 'oversBowled'],
} as const satisfies Record<StatSport, readonly string[]>;

/** Which Prisma model holds each sport's per-match rows. */
const MODEL_BY_SPORT: Record<StatSport, 'basketballStats' | 'footballStats' | 'cricketStats'> = {
  BASKETBALL: 'basketballStats',
  FOOTBALL:   'footballStats',
  CRICKET:    'cricketStats',
};

/** A player's career totals for one sport: match count + each summed metric. */
export interface CareerTotals {
  matches: number;
  totals: Record<string, number>;
}

/** True when `sport` is one Radar aggregates career stats for. */
export function isStatSport(sport: string | null | undefined): sport is StatSport {
  return sport === 'BASKETBALL' || sport === 'FOOTBALL' || sport === 'CRICKET';
}

/**
 * Pure: sum an array of per-match rows into career totals for a sport. Ignores
 * columns not in the sport's canonical set; coerces missing/nullish to 0.
 */
export function aggregateCareerTotals(sport: StatSport, rows: Array<Record<string, unknown>>): CareerTotals {
  const fields = CAREER_STAT_FIELDS[sport];
  const totals: Record<string, number> = {};
  for (const f of fields) totals[f] = 0;
  for (const row of rows) {
    for (const f of fields) totals[f] += Number(row[f] ?? 0);
  }
  return { matches: rows.length, totals };
}

/**
 * Pure: does a player's totals meet EVERY minimum threshold? `thresholds` maps a
 * metric name to its inclusive minimum (e.g. `{ points: 20 }`). Unknown metrics
 * are treated as 0 (so an impossible threshold simply excludes everyone).
 */
export function meetsThresholds(totals: CareerTotals, thresholds: Record<string, number>): boolean {
  return Object.entries(thresholds).every(([metric, min]) => (totals.totals[metric] ?? 0) >= min);
}

/**
 * DB: career totals for the given users (or all athletes when `userIds` is
 * omitted) in ONE `groupBy` — no row cap. Returns a map keyed by userId;
 * athletes with no matches in that sport are simply absent from the map.
 */
export async function careerTotalsForUsers(
  sport: StatSport,
  userIds?: string[],
): Promise<Map<string, CareerTotals>> {
  const { default: prisma } = await import('../config/db');
  const fields = CAREER_STAT_FIELDS[sport];
  // The five stat models share the groupBy shape; access dynamically by sport.
  const model = (prisma as any)[MODEL_BY_SPORT[sport]];

  const grouped = await model.groupBy({
    by: ['userId'],
    ...(userIds ? { where: { userId: { in: userIds } } } : {}),
    _sum: Object.fromEntries(fields.map((f) => [f, true])),
    _count: { _all: true },
  });

  const out = new Map<string, CareerTotals>();
  for (const g of grouped as Array<{ userId: string; _sum: Record<string, number | null>; _count: { _all: number } }>) {
    const totals: Record<string, number> = {};
    for (const f of fields) totals[f] = Number(g._sum[f] ?? 0);
    out.set(g.userId, { matches: g._count._all, totals });
  }
  return out;
}

/**
 * DB: the subset of `candidateIds` (or all athletes) whose career totals meet
 * every threshold. This replaces the engine's `take: 200`-then-reduce approach,
 * so no athlete is dropped for being past an arbitrary row cap.
 */
export async function userIdsMeetingStatThresholds(
  sport: StatSport,
  thresholds: Record<string, number>,
  candidateIds?: string[],
): Promise<Set<string>> {
  const totals = await careerTotalsForUsers(sport, candidateIds);
  const out = new Set<string>();
  for (const [userId, t] of totals) {
    if (meetsThresholds(t, thresholds)) out.add(userId);
  }
  return out;
}
