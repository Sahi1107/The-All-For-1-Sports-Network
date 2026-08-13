import { Sport } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// Free-text people search matcher. A person searching "football" expects football
// players — but the old query only matched name + bio, so a sport (or position, or
// city) returned almost nothing. This matches everything a user would reasonably
// type: name, bio, position, location (substring) AND sport (an enum, mapped by
// keyword). Pure so the mapping is unit-tested. The privacy gate is applied
// separately by the caller and is NEVER relaxed here.
// ─────────────────────────────────────────────────────────────────────────────

/** Colloquial → canonical sport keyword fragments. */
const SPORT_ALIASES: Record<string, string> = {
  soccer: 'football',
  footy: 'football',
  hoops: 'basketball',
  'ping pong': 'table tennis',
  ttennis: 'table tennis',
};

function humanize(sport: string): string {
  return sport.toLowerCase().replace(/_/g, ' ');
}

/** Sport enum values whose humanized name matches the term (either direction, so
 *  "hockey" → FIELD_HOCKEY and "foot" → FOOTBALL both work). */
export function sportsMatching(rawTerm: string): Sport[] {
  const term = (SPORT_ALIASES[rawTerm.trim().toLowerCase()] ?? rawTerm.trim().toLowerCase());
  if (term.length < 3) return []; // too short to be a confident sport match
  return (Object.values(Sport) as Sport[]).filter((s) => {
    const h = humanize(s);
    return h.includes(term) || term.includes(h);
  });
}

/**
 * Prisma OR clause for a free-text people search. Returns null for an empty term
 * so the caller can omit the OR entirely. The literal `search` is used for the
 * substring fields; the lowercased term drives the sport-enum mapping.
 */
export function personSearchOr(search: string): Array<Record<string, unknown>> | null {
  const literal = search.trim();
  if (!literal) return null;

  const or: Array<Record<string, unknown>> = [
    { name:     { contains: literal, mode: 'insensitive' } },
    { bio:      { contains: literal, mode: 'insensitive' } },
    { position: { contains: literal, mode: 'insensitive' } },
    { location: { contains: literal, mode: 'insensitive' } },
  ];

  const sports = sportsMatching(literal);
  if (sports.length > 0) or.push({ sport: { in: sports } });

  return or;
}
