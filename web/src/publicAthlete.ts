// ─────────────────────────────────────────────────────────────────────────────
// THE public-exposure gate for athlete profiles.  ONE definition, used by the
// public read API, the SSR renderer, AND the sitemap — never re-implemented.
//
// HARD RULE (non-negotiable, defense in depth):
//   A profile is public / indexable ONLY IF
//       role === ATHLETE
//       AND discoverable === true
//       AND guardianManaged === false      ← explicit; NEVER trust `discoverable` alone
//       AND a real DOB is present
//       AND age >= 13   (computed from DOB, not the stored/stale `age` column)
//
//   • Under-13 and guardian-managed accounts are excluded even if some other flag
//     is wrong — two independent conditions must both hold.
//   • Ineligible OR non-existent both resolve to `null` here → the caller returns
//     an identical hard 404, so a crawler can't even distinguish "private/minor"
//     from "doesn't exist" (no existence leak).
//   • The WHERE gates the query; isPubliclyEligible() re-gates the fetched row.
//     Both must agree — belt and suspenders.
// ─────────────────────────────────────────────────────────────────────────────

export const PUBLIC_ATHLETE_MIN_AGE = 13;

/** The minimal set of fields the gate inspects (fetched from the DB, not all emitted). */
export interface GateFields {
  role: string;
  discoverable: boolean;
  guardianManaged: boolean;
  dateOfBirth: Date | null;
}

/**
 * The latest date of birth that still means age >= minAge, as of `now` (UTC,
 * inclusive). A DOB on or before this cutoff is old enough. Someone born exactly
 * `minAge` years ago today is included (age == 13 → eligible).
 */
export function minAgeCutoff(now: Date, minAge = PUBLIC_ATHLETE_MIN_AGE): Date {
  return new Date(Date.UTC(now.getUTCFullYear() - minAge, now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Prisma-compatible WHERE that encodes the full gate. Structurally assignable to
 * Prisma.UserWhereInput when wired to prisma.user.findFirst. A null DOB fails the
 * `lte` comparison, so it's excluded; `not: null` is stated anyway for clarity.
 */
export function publicAthleteWhere(now: Date) {
  return {
    role: 'ATHLETE' as const,
    discoverable: true,
    guardianManaged: false,
    dateOfBirth: { not: null, lte: minAgeCutoff(now) },
  };
}

/**
 * Independent re-check of a fetched row. MUST mirror publicAthleteWhere exactly.
 * Runs after the query so that even a wrong/compromised query can never leak an
 * ineligible profile. Any deviation → false (fail closed).
 */
export function isPubliclyEligible(a: GateFields, now: Date): boolean {
  if (a.role !== 'ATHLETE') return false;
  if (a.discoverable !== true) return false;
  if (a.guardianManaged !== false) return false;
  if (!(a.dateOfBirth instanceof Date) || Number.isNaN(a.dateOfBirth.getTime())) return false; // DOB required + valid
  return a.dateOfBirth.getTime() <= minAgeCutoff(now).getTime();
}

// ── Safe public output shape — the ONLY fields ever emitted publicly ─────────────
// Deliberately excludes: dateOfBirth/age, city/precise location, avatar photo,
// email/contactEmail/phone, guardian fields, discoverable/guardianManaged flags,
// social-graph lists — see Phase 1b field decisions.

export interface PublicAthlete {
  slug: string;
  name: string;
  sport: string | null;
  position: string | null;
  height: string | null;
  bio: string | null;
  achievements: string[];
  verified: boolean;
  state: string | null; // STATE only — never city
  teams: string[];      // team names only
}

/** The DB row we select: gate fields + safe output fields (+ relations). */
export interface AthleteRow extends GateFields {
  id: string;
  name: string;
  sport: string | null;
  position: string | null;
  height: string | null;
  bio: string | null;
  achievements: string[];
  verified: boolean;
  state: string | null;
  teamMemberships?: Array<{ team: { name: string | null } | null } | null> | null;
}

/** Prisma select — only the gate fields + safe output columns are ever read. */
export const PUBLIC_ATHLETE_SELECT = {
  id: true,
  name: true,
  role: true,
  discoverable: true,
  guardianManaged: true,
  dateOfBirth: true,
  sport: true,
  position: true,
  height: true,
  bio: true,
  achievements: true,
  verified: true,
  state: true,
  teamMemberships: { select: { team: { select: { name: true } } } },
} as const;

/** URL-safe kebab of a display name (ASCII-fold light; strips anything unsafe). */
export function kebab(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')        // strip combining diacritical marks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')            // non-alphanumerics → hyphen
    .replace(/^-+|-+$/g, '')                // trim hyphens
    .slice(0, 60) || 'athlete';
}

/** Canonical slug: `<name-kebab>-<12-hex-id-prefix>` (non-enumerable, unique enough). */
export function slugFor(row: { id: string; name: string }): string {
  return `${kebab(row.name)}-${row.id.replace(/-/g, '').slice(0, 12)}`;
}

/**
 * Map a gated DB row → the minimal safe public object. Constructs the output
 * explicitly, so no sensitive column can ever ride along even if it's present on
 * the row.
 */
export function toPublicAthlete(row: AthleteRow): PublicAthlete {
  return {
    slug: slugFor(row),
    name: row.name,
    sport: row.sport ?? null,
    position: row.position ?? null,
    height: row.height ?? null,
    bio: row.bio ?? null,
    achievements: Array.isArray(row.achievements) ? row.achievements : [],
    verified: row.verified === true,
    state: row.state ?? null,
    teams: (row.teamMemberships ?? [])
      .map((m) => m?.team?.name ?? null)
      .filter((n): n is string => typeof n === 'string' && n.length > 0),
  };
}

/**
 * The final, DB-agnostic step every fetch path funnels through: re-gate the
 * fetched row independently, then serialize to the safe shape. A null row (not
 * found OR gated out by the query) and a row that fails the re-check both yield
 * null → the caller emits an identical hard 404. This is where the second,
 * independent gate lives, so it applies whether the row came from Prisma or SQL.
 */
export function gateAndSerialize(row: AthleteRow | null, now: Date): PublicAthlete | null {
  if (!row) return null;
  if (!isPubliclyEligible(row, now)) return null; // belt-and-suspenders re-check
  return toPublicAthlete(row);
}

/** Injected row-fetcher so the gate is testable without a DB (real: prisma.user.findFirst). */
export type FetchRow = (where: object, select: object) => Promise<AthleteRow | null>;

/**
 * Prisma-oriented convenience: fetch by id through the gate WHERE, then
 * gateAndSerialize. Both layers must pass. (The SSR renderer uses the SQL path
 * in db.ts, which funnels through the same gateAndSerialize.)
 */
export async function getPublicAthlete(
  fetchRow: FetchRow,
  id: string,
  now: Date = new Date(),
): Promise<PublicAthlete | null> {
  const row = await fetchRow({ id, ...publicAthleteWhere(now) }, PUBLIC_ATHLETE_SELECT);
  return gateAndSerialize(row, now);
}

/**
 * Extract the 12-hex id token from a canonical athlete slug
 * (`<name-kebab>-<12hex>`). Returns null if the slug has no valid token.
 */
export function parseSlugId(slug: string): string | null {
  const m = /-([0-9a-f]{12})$/.exec(slug);
  return m ? m[1] : null;
}
