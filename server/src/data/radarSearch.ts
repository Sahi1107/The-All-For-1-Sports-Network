/**
 * Radar retrieval engine (Steps 4–5).
 *
 * Turns parsed filters into a database search, wiring in the foundations:
 *   • structured location columns (city/state/region) — replaces free-text
 *     `location contains`;
 *   • career-stat totals via a capless groupBy — replaces `take: 200`-reduce;
 *   • nearest-location widening (Step 5): city → state → region → country.
 *
 * TWO INVARIANTS that never relax — not by widening (Step 5), not by ranking
 * (Step 7):
 *   1. discoverable: true   — minor-safety; under-13 accounts stay hidden.
 *   2. sport                — once the query names a sport, it always applies.
 *
 * These live in buildBaseWhere, which is built ONCE and reused for every widening
 * tier. Only the location predicate changes per tier (see locationTiers), so the
 * ladder can never loosen the sport or discoverable constraint — it's structurally
 * impossible, and locked by tests.
 *
 * The response keeps the existing shape (results/filters/total) plus additive,
 * ignored-by-old-clients fields (per-result matchTier/approximate, top-level
 * `widened`) so the live UI keeps working. prisma is imported lazily so the pure
 * helpers unit-test without a DB.
 */

import { Prisma, Role, Sport } from '@prisma/client';
import { positionMatchAliases } from './positions';
import { resolveRegion } from './locations';
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

/** How closely a result matched the requested location (narrowest → widest). */
export type LocationTier = 'city' | 'state' | 'region' | 'country';

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
 * The FIXED core of the query — everything except location. `discoverable: true`
 * and (when named) `sport` are always present; no argument can remove them, and
 * widening reuses this object verbatim.
 */
export function buildBaseWhere(filters: RadarFilters): Prisma.UserWhereInput {
  const where: Prisma.UserWhereInput = {
    role: (filters.role as Role) || Role.ATHLETE,
    discoverable: true, // ── minor-safety — NEVER relaxed ──
  };

  if (filters.sport) where.sport = filters.sport as Sport; // ── sport — NEVER relaxed ──

  if (filters.position) {
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

  return where;
}

/**
 * The location predicates to try, narrowest → widest, for the nearest-location
 * fallback. Each entry constrains ONLY location columns (city/state/region) — it
 * never contains sport/discoverable/role, so AND-ing it onto the base where can
 * only narrow the location, never relax an invariant. The final `country` tier
 * carries no location predicate (the platform is India-scoped) — the widest net.
 */
export function locationTiers(filters: RadarFilters): Array<{ tier: LocationTier; where: Prisma.UserWhereInput }> {
  const tiers: Array<{ tier: LocationTier; where: Prisma.UserWhereInput }> = [];
  const cityEq  = filters.city  ? { city:  { equals: filters.city,  mode: 'insensitive' as const } } : null;
  const stateEq = filters.state ? { state: { equals: filters.state, mode: 'insensitive' as const } } : null;
  const region  = filters.state ? resolveRegion(null, filters.state) : null;

  if (cityEq && stateEq) {
    tiers.push({ tier: 'city',  where: { ...cityEq, ...stateEq } }); // exact: city within state
    tiers.push({ tier: 'state', where: stateEq });
  } else if (cityEq) {
    tiers.push({ tier: 'city',  where: cityEq });
  } else if (stateEq) {
    tiers.push({ tier: 'state', where: stateEq });
  }
  if (region) tiers.push({ tier: 'region', where: { region: { equals: region, mode: 'insensitive' } } });
  tiers.push({ tier: 'country', where: {} }); // widest — base only
  return tiers;
}

/**
 * The full exact-match where (base + the narrowest applicable location tier).
 * Used where widening isn't needed and kept for the invariant tests.
 */
export function buildAthleteWhere(filters: RadarFilters): Prisma.UserWhereInput {
  return { ...buildBaseWhere(filters), ...locationTiers(filters)[0].where };
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

type RawUser = Prisma.UserGetPayload<{ select: typeof RESULT_SELECT }>;

export type RadarResult = RawUser & {
  stats?: Record<string, number>;
  /** Which location tier this result matched. */
  matchTier: LocationTier;
  /** True when this result came from a WIDER tier than the query asked for. */
  approximate: boolean;
};

/** Location-widening search output (Step 5), before graceful-empty relaxation. */
interface TierOutcome {
  results: RadarResult[];
  total: number;
  /** Present when results were filled from wider tiers than requested. */
  widened: { widestTier: LocationTier } | null;
}

export interface SearchOutcome extends TierOutcome {
  /** Soft filters dropped to avoid a dead-end (Step 6); null when none were needed. */
  relaxed: string[] | null;
  /** Set only when truly empty — no discoverable athletes even after full relaxation. */
  emptyReason: 'no-athletes-in-sport' | 'no-athletes' | null;
}

/**
 * Location-widening search (Step 5). The base where (sport + minor-safety +
 * position/age + any stat filter) is fixed; try each location tier narrowest →
 * widest, accumulating de-duplicated results until the limit. Results from a tier
 * wider than requested are flagged `approximate`. Wrapped by searchAthletes,
 * which adds the graceful-empty relaxation ladder (Step 6).
 */
async function searchTiered(filters: RadarFilters): Promise<TierOutcome> {
  const { default: prisma } = await import('../config/db');
  const limit = Math.min(Math.max(filters.limit || 10, 1), 20);

  const base = buildBaseWhere(filters);
  const sport = filters.sport;

  // Career-stat filter → capless set of matching users, fixed across every tier.
  if (isStatSport(sport)) {
    const thresholds = statThresholds(sport, filters);
    if (Object.keys(thresholds).length > 0) {
      const ids = await userIdsMeetingStatThresholds(sport, thresholds);
      if (ids.size === 0) return { results: [], total: 0, widened: null };
      base.id = { in: [...ids] };
    }
  }

  const tiers = locationTiers(filters);
  const exactTier = tiers[0].tier;
  const collected: Array<{ user: RawUser; tier: LocationTier }> = [];
  const seen = new Set<string>();

  for (const { tier, where: locWhere } of tiers) {
    if (collected.length >= limit) break;
    const users = await prisma.user.findMany({
      // AND-array so base's OR (positions) and any id filters compose cleanly and
      // no location key can shadow a base invariant.
      where: { AND: [base, locWhere, ...(seen.size ? [{ id: { notIn: [...seen] } }] : [])] },
      select: RESULT_SELECT,
      take: limit - collected.length,
      orderBy: { createdAt: 'desc' },
    });
    for (const u of users) {
      if (seen.has(u.id)) continue;
      seen.add(u.id);
      collected.push({ user: u, tier });
    }
  }

  // Attach display totals for just this page (one groupBy over the page's users).
  const statSport = isStatSport(sport);
  const totalsByUser = statSport && collected.length
    ? await careerTotalsForUsers(sport, collected.map((c) => c.user.id))
    : null;

  const results: RadarResult[] = collected.map(({ user, tier }) => {
    let stats: Record<string, number> | undefined;
    if (totalsByUser && statSport) {
      const t = totalsByUser.get(user.id);
      if (t) {
        stats = {};
        for (const key of DISPLAY_STATS[sport as StatSport]) stats[key] = t.totals[key] ?? 0;
      }
    }
    return { ...user, stats, matchTier: tier, approximate: tier !== exactTier };
  });

  const widened = results.some((r) => r.approximate)
    ? { widestTier: collected[collected.length - 1].tier }
    : null;

  return { results, total: results.length, widened };
}

// ─── Step 6: graceful-empty "never dead-end" ─────────────────────────────────

/** True when the query carries any career-stat threshold. */
export function hasStatFilter(f: RadarFilters): boolean {
  return (
    f.minGoals !== undefined || f.minAssists !== undefined || f.minPoints !== undefined ||
    f.minRebounds !== undefined || f.minRuns !== undefined || f.minWickets !== undefined
  );
}

/**
 * The relaxation ladder for graceful-empty. When the full query returns nothing,
 * drop the SOFT filters progressively — stats → age → position — to surface the
 * closest available players. Sport and minor-safety are never in this ladder, so
 * they can't be relaxed. Only filters that were actually present produce a step,
 * so there are no redundant re-queries.
 */
export function buildRelaxationSteps(filters: RadarFilters): Array<{ dropped: string[]; filters: RadarFilters }> {
  const steps: Array<{ dropped: string[]; filters: RadarFilters }> = [];
  const dropped: string[] = [];
  let f: RadarFilters = { ...filters };

  if (hasStatFilter(filters)) {
    f = { ...f, minGoals: undefined, minAssists: undefined, minPoints: undefined, minRebounds: undefined, minRuns: undefined, minWickets: undefined };
    dropped.push('stats');
    steps.push({ dropped: [...dropped], filters: f });
  }
  if (filters.minAge !== undefined || filters.maxAge !== undefined) {
    f = { ...f, minAge: undefined, maxAge: undefined };
    dropped.push('age');
    steps.push({ dropped: [...dropped], filters: f });
  }
  if (filters.position) {
    f = { ...f, position: undefined };
    dropped.push('position');
    steps.push({ dropped: [...dropped], filters: f });
  }
  return steps;
}

/** Why a search came back truly empty — sport-specific when a sport was named. */
export function emptyReasonFor(filters: RadarFilters): 'no-athletes-in-sport' | 'no-athletes' {
  return filters.sport ? 'no-athletes-in-sport' : 'no-athletes';
}

/**
 * Public entry point. Runs the location-widening search; if it finds nothing,
 * walks the relaxation ladder (soft filters only) so Radar never dead-ends,
 * reporting what it dropped. If even a sport-only search is empty, returns an
 * honest empty with a reason — you can't invent players of a sport that has none.
 *
 * Sport + minor-safety hold throughout: searchTiered always ANDs discoverable:
 * true and the sport, and the relaxation ladder never touches either.
 */
export async function searchAthletes(filters: RadarFilters): Promise<SearchOutcome> {
  const primary = await searchTiered(filters);
  if (primary.results.length > 0) return { ...primary, relaxed: null, emptyReason: null };

  for (const step of buildRelaxationSteps(filters)) {
    const out = await searchTiered(step.filters);
    if (out.results.length > 0) return { ...out, relaxed: step.dropped, emptyReason: null };
  }

  return { results: [], total: 0, widened: null, relaxed: null, emptyReason: emptyReasonFor(filters) };
}
