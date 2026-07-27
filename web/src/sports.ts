// Sport enum ↔ URL-slug ↔ human label. The enum values mirror Prisma's `Sport`.
// URL slug is the enum lowercased with underscores → hyphens (FIELD_HOCKEY →
// "field-hockey"); label is Title Case with spaces ("Field Hockey").

export const SPORTS = [
  'BASKETBALL', 'FOOTBALL', 'CRICKET', 'FIELD_HOCKEY', 'BADMINTON', 'ATHLETICS',
  'WRESTLING', 'BOXING', 'SHOOTING', 'WEIGHTLIFTING', 'ARCHERY', 'TENNIS',
  'TABLE_TENNIS', 'RUGBY', 'SWIMMING', 'VOLLEYBALL',
] as const;

export type SportEnum = (typeof SPORTS)[number];

const SPORT_SET = new Set<string>(SPORTS);

/** Enum → URL slug: `FIELD_HOCKEY` → `field-hockey`. */
export function sportSlug(sport: string): string {
  return sport.toLowerCase().replace(/_/g, '-');
}

/** Enum → display label: `FIELD_HOCKEY` → `Field Hockey`. */
export function sportLabel(sport: string): string {
  return sport
    .split('_')
    .map((w) => (w ? w[0] + w.slice(1).toLowerCase() : w))
    .join(' ');
}

/** URL slug → enum, or null if it isn't a known sport (untrusted input → validate). */
export function sportFromSlug(slug: string): SportEnum | null {
  const candidate = slug.toUpperCase().replace(/-/g, '_');
  return SPORT_SET.has(candidate) ? (candidate as SportEnum) : null;
}
