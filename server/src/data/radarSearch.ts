/**
 * Radar retrieval engine (Step 4).
 *
 * Turns parsed filters into a database search, wiring in the two foundations:
 *   • structured location columns (city/state) — replaces the old free-text
 *     `location contains` match;
 *   • career-stat totals via a capless groupBy — replaces the old
 *     `take: 200`-then-reduce, which silently dropped athletes past row 200.
 *
 * TWO INVARIANTS, enforced in buildAthleteWhere and never relaxed by any later
 * widening step (Step 5) or ranking (Step 7):
 *   1. discoverable: true   — minor-safety; under-13 accounts stay hidden.
 *   2. sport                — once the query names a sport, it always applies.
 *
 * The response contract (results/filters/total and each result's fields) is kept
 * identical to the previous engine so the live Scout Copilot UI keeps working;
 * the rename to "Radar" is Step 9. prisma is imported lazily so the pure helpers
 * (buildAthleteWhere, statThresholds) unit-test without a DB.
 */

import { Prisma, Role, Sport } from '@prisma/client';
import { positionMatchAliases } from './positions';
import {
  isStatSport,
  careerTotalsForUsers,
  userIdsMeetingStatThresholds,
  type StatSport,
} from './careerStats';

export interface RadarFilters {
  sport?: string;
  role?: string;
  position?: string;
  minAge?: number;
  maxAge?: number;
  state?: string;
  city?: string;
  minGoals?: number;
  minAssists?: number;
  minPoints?: number;
  minRebounds?: number;
  minRuns?: number;
  minWickets?: number;
  limit?: number;
}

/** Columns returned for each result — matches what the Scout Copilot card reads. */
const RESULT_SELECT = {
  id: true, name: true, avatar: true, role: true, sport: true,
  position: true, age: true, location: true, height: true, bio: true, achievements: true,
} satisfies Prisma.UserSelect;

/** Which career totals to surface per sport (kept identical to prior display). */
const DISPLAY_STATS: Record<StatSport, readonly string[]> = {
  BASKETBALL: ['points', 'rebounds', 'assists'],
  FOOTBALL:   ['goals', 'assists'],
  CRICKET:    ['runs', 'wickets'],
};

/**
 * Build the Prisma where clause. `discoverable: true` and (when named) `sport`
 * are ALWAYS present — no argument can remove them.
 */
export function buildAthleteWhere(filters: RadarFilters): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {
    role: (filters.role as Role) || Role.ATHLETE,
    discoverable: true, // ── minor-safety — NEVER relaxed ──
  };

  if (filters.sport) where.sport = filters.sport as Sport; // ── sport — NEVER relaxed ──

  if (filters.position) {
    // Resolve the phrase to its canonical group and match every spelling in it;
    // unknown sport/position falls back to a substring match so nothing regresses.
    const aliases = positionMatchAliases(filters.sport, filters.position);
    if (aliases) {
      where.OR = aliases.map((a) => ({ position: { equals: a, mode: 'insensitive' } }));
    } else {
      where.position = { contains: filters.position, mode: 'insensitive' };
    }
  }

  if (filters.minAge !== undefined || filters.maxAge !== undefined) {
    where.age = {
      ...(filters.minAge !== undefined ? { gte: filters.minAge } : {}),
      ...(filters.maxAge !== undefined ? { lte: filters.maxAge } : {}),
    };
  }

  // Structured location — exact (case-insensitive) match on the parsed columns.
  // Nearest-location widening (city → state → region → country) is Step 5.
  if (filters.city)  where.city  = { equals: filters.city,  mode: 'insensitive' };
  if (filters.state) where.state = { equals: filters.state, mode: 'insensitive' };

  return where;
}

/**
 * Sport-scoped career-stat thresholds from the parsed filters. Only thresholds
 * that belong to the query's sport are kept, so a mismatched filter (e.g.
 * minGoals on a basketball query) can never exclude everyone.
 */
export function statThresholds(sport: string | undefined, filters: RadarFilters): Record<string, number> {
  const t: Record<string, number> = {};
  if (sport === 'BASKETBALL') {
    if (filters.minPoints   !== undefined) t.points   = filters.minPoints;
    if (filters.minRebounds !== undefined) t.rebounds = filters.minRebounds;
    if (filters.minAssists  !== undefined) t.assists  = filters.minAssists;
  } else if (sport === 'FOOTBALL') {
    if (filters.minGoals   !== undefined) t.goals   = filters.minGoals;
    if (filters.minAssists !== undefined) t.assists = filters.minAssists;
  } else if (sport === 'CRICKET') {
    if (filters.minRuns    !== undefined) t.runs    = filters.minRuns;
    if (filters.minWickets !== undefined) t.wickets = filters.minWickets;
  }
  return t;
}

export interface RadarResult {
  id: string;
  name: string;
  avatar: string | null;
  role: Role;
  sport: Sport | null;
  position: string | null;
  age: number | null;
  location: string | null;
  height: string | null;
  bio: string | null;
  achievements: string[];
  stats?: Record<string, number>;
}

/**
 * Run the search. Stat thresholds resolve to a capless set of matching userIds
 * (Step 3) that is AND-ed into the where; results are then fetched with a real
 * `take: limit` and their display totals attached. Ordering stays newest-first
 * (relevance ranking is Step 7).
 */
export async function searchAthletes(filters: RadarFilters): Promise<{ results: RadarResult[]; total: number }> {
  const { default: prisma } = await import('../config/db');
  const limit = Math.min(Math.max(filters.limit || 10, 1), 20);

  const where = buildAthleteWhere(filters);
  const sport = filters.sport;

  // Career-stat filter → capless set of matching users, AND-ed into the where.
  if (isStatSport(sport)) {
    const thresholds = statThresholds(sport, filters);
    if (Object.keys(thresholds).length > 0) {
      const ids = await userIdsMeetingStatThresholds(sport, thresholds);
      if (ids.size === 0) return { results: [], total: 0 };
      where.id = { in: [...ids] };
    }
  }

  const users = await prisma.user.findMany({
    where,
    select: RESULT_SELECT,
    take: limit,
    orderBy: { createdAt: 'desc' },
  });

  // Attach display totals for just this page (one groupBy over the page's users).
  let totalsByUser: Map<string, { totals: Record<string, number> }> | null = null;
  if (isStatSport(sport) && users.length > 0) {
    totalsByUser = await careerTotalsForUsers(sport, users.map((u) => u.id));
  }

  const results: RadarResult[] = users.map((u) => {
    let stats: Record<string, number> | undefined;
    if (totalsByUser && isStatSport(sport)) {
      const t = totalsByUser.get(u.id);
      if (t) {
        stats = {};
        for (const key of DISPLAY_STATS[sport]) stats[key] = t.totals[key] ?? 0;
      }
    }
    return { ...u, stats };
  });

  return { results, total: results.length };
}
