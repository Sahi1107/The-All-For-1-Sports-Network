// Read-only DB access for the public renderer. Uses a SELECT-only Postgres role
// (DATABASE_URL_RO) — the service can never write. The gated SQL below is the
// PRIMARY gate; every row it returns is ALSO re-checked by isPubliclyEligible
// (via gateAndSerialize in the caller), so the exposure rule holds even if this
// query were ever wrong. Profiles, hub listings, AND the sitemap all funnel
// through the same gate — a row an ineligible/minor athlete can never appear in
// any of them.
import pg from 'pg';
import { minAgeCutoff, type AthleteRow } from './publicAthlete.js';
import type { SportEnum } from './sports.js';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL_RO,
  max: 5,
  idleTimeoutMillis: 30_000,
  statement_timeout: 5_000,
});

// Never let an idle-client / connection error crash the process — log and move on.
// (Per-request queries surface their own errors, which server.ts turns into a 503.)
pool.on('error', (err) => console.error('pg pool error', err));

// The gate, in SQL. MUST mirror publicAthleteWhere() exactly:
//   role = ATHLETE, discoverable = true, guardian_managed = false,
//   date_of_birth present AND <= (now - 13y).
// `$CUTOFF` is always the LAST bound param in each query below.
const GATE_SQL = `
      u.role::text = 'ATHLETE'
  AND u.discoverable = true
  AND u.guardian_managed = false
  AND u.date_of_birth IS NOT NULL
  AND u.date_of_birth <= $CUTOFF`;

// Safe columns (+ gate columns for the re-check) — the ONLY columns ever read.
const ATHLETE_COLS = `
  u.id, u.name, u.role::text AS role, u.discoverable,
  u.guardian_managed AS "guardianManaged", u.date_of_birth AS "dateOfBirth",
  u.sport::text AS sport, u.position, u.height, u.bio,
  u.achievements, u.verified, u.state, u."updatedAt" AS updated_at`;

const TEAM_AGG = `COALESCE(array_agg(t.name) FILTER (WHERE t.name IS NOT NULL), '{}') AS team_names`;
const TEAM_JOINS = `
  LEFT JOIN "TeamMember" tm ON tm."userId" = u.id AND tm.status = 'ACCEPTED'
  LEFT JOIN "Team" t ON t.id = tm."teamId"`;

/** A gated row plus updatedAt (used for sitemap <lastmod>). */
export type AthleteRowWithMeta = AthleteRow & { updatedAt: Date | null };

/** Map a raw pg row → AthleteRow (+ updatedAt). Missing relations → empty. */
function mapRow(r: any): AthleteRowWithMeta {
  return {
    id: r.id,
    name: r.name,
    role: r.role,
    discoverable: r.discoverable,
    guardianManaged: r.guardianManaged,
    dateOfBirth: r.dateOfBirth ? new Date(r.dateOfBirth) : null,
    sport: r.sport ?? null,
    position: r.position ?? null,
    height: r.height ?? null,
    bio: r.bio ?? null,
    achievements: Array.isArray(r.achievements) ? r.achievements : [],
    verified: r.verified === true,
    state: r.state ?? null,
    teamMemberships: (r.team_names ?? []).map((name: string) => ({ team: { name } })),
    updatedAt: r.updated_at ? new Date(r.updated_at) : null,
  };
}

const PROFILE_SQL = `
  SELECT ${ATHLETE_COLS}, ${TEAM_AGG}
  FROM "User" u ${TEAM_JOINS}
  WHERE ${GATE_SQL.replace('$CUTOFF', '$2')}
    AND u.id::text LIKE $1
  GROUP BY u.id
  LIMIT 2`;

/**
 * Fetch the gated athlete row for a 12-hex slug token, or null (not found /
 * ambiguous). Re-check + serialize happen in the caller via gateAndSerialize,
 * so a null here and a null there both become an identical hard 404.
 */
export async function fetchAthleteRow(hex12: string, now: Date): Promise<AthleteRow | null> {
  if (!/^[0-9a-f]{12}$/.test(hex12)) return null; // validate token — no LIKE wildcards can sneak in
  const likePattern = `${hex12.slice(0, 8)}-${hex12.slice(8, 12)}%`; // uuid prefix (8-4-...)
  const { rows } = await pool.query(PROFILE_SQL, [likePattern, minAgeCutoff(now)]);
  if (rows.length !== 1) return null; // 0 = not found; >1 = ambiguous prefix → treat as not found
  return mapRow(rows[0]);
}

const BY_SPORT_SQL = `
  SELECT ${ATHLETE_COLS}, ${TEAM_AGG}
  FROM "User" u ${TEAM_JOINS}
  WHERE ${GATE_SQL.replace('$CUTOFF', '$2')}
    AND u.sport::text = $1
  GROUP BY u.id
  ORDER BY u.verified DESC, u.name ASC
  LIMIT $3`;

/**
 * All eligible athletes in a sport (gated). The optional state narrowing is done
 * by the caller in JS (kebab match) so it stays byte-identical to how state
 * links are generated. Every row is still re-gated via gateAndSerialize upstream.
 */
export async function fetchAthletesBySport(
  sport: SportEnum,
  now: Date,
  limit = 500,
): Promise<AthleteRowWithMeta[]> {
  const { rows } = await pool.query(BY_SPORT_SQL, [sport, minAgeCutoff(now), limit]);
  return rows.map(mapRow);
}

// Featured athletes for the /athletes root — a cross-sport preview so the page
// shows real people, not just sport chips. Same GATE_SQL as everywhere (no
// relaxation); `best_rank` is a DISPLAY-ONLY correlated subquery (a ranking is
// public data and never affects eligibility). Verified + ranked athletes surface
// first so the page reads as alive.
const FEATURED_SQL = `
  SELECT ${ATHLETE_COLS}, ${TEAM_AGG},
    (SELECT MIN(pr.rank) FROM "PlayerRanking" pr WHERE pr."userId" = u.id) AS best_rank
  FROM "User" u ${TEAM_JOINS}
  WHERE ${GATE_SQL.replace('$CUTOFF', '$1')}
  GROUP BY u.id
  ORDER BY u.verified DESC, best_rank ASC NULLS LAST, u."updatedAt" DESC NULLS LAST, u.name ASC
  LIMIT $2`;

/** A gated athlete row + its best public ranking (display only). */
export type FeaturedRow = AthleteRowWithMeta & { bestRank: number | null };

/** A cross-sport set of eligible athletes for the /athletes root. Re-gated per row upstream. */
export async function fetchFeaturedAthletes(now: Date, limit = 12): Promise<FeaturedRow[]> {
  const { rows } = await pool.query(FEATURED_SQL, [minAgeCutoff(now), limit]);
  return rows.map((r) => ({ ...mapRow(r), bestRank: r.best_rank != null ? Number(r.best_rank) : null }));
}

const SITEMAP_SQL = `
  SELECT u.id, u.name, u.role::text AS role, u.discoverable,
         u.guardian_managed AS "guardianManaged", u.date_of_birth AS "dateOfBirth",
         u."updatedAt" AS updated_at
  FROM "User" u
  WHERE ${GATE_SQL.replace('$CUTOFF', '$1')}
  ORDER BY u."updatedAt" DESC NULLS LAST
  LIMIT $2`;

/** All eligible athletes for the sitemap (gated). Re-gated per row upstream. */
export async function fetchEligibleForSitemap(now: Date, limit = 5000): Promise<AthleteRowWithMeta[]> {
  const { rows } = await pool.query(SITEMAP_SQL, [minAgeCutoff(now), limit]);
  return rows.map(mapRow);
}

const SPORT_COUNTS_SQL = `
  SELECT u.sport::text AS sport, count(*)::int AS n
  FROM "User" u
  WHERE ${GATE_SQL.replace('$CUTOFF', '$1')}
    AND u.sport IS NOT NULL
  GROUP BY u.sport
  ORDER BY n DESC, u.sport ASC`;

/** Sports that have ≥1 eligible athlete, with counts (for the /athletes root). */
export async function fetchSportsWithCounts(now: Date): Promise<Array<{ sport: string; n: number }>> {
  const { rows } = await pool.query(SPORT_COUNTS_SQL, [minAgeCutoff(now)]);
  return rows.map((r) => ({ sport: r.sport as string, n: r.n as number }));
}
