// Resolve a public OG/share path param to a Prisma id-filter.
//
// A public OG URL addresses an entity by its 12-hex "slug token" — the id's
// first 12 hex digits with hyphens stripped — the SAME short token the slug
// system already uses (see web/publicAthlete slugFor/parseSlugId). Addressing
// cards by this token keeps full UUIDs off public/indexed pages, which is the
// whole point of the short-token slug design.
//
// Full UUIDs are STILL accepted, as a backward-compatibility path, so cards
// already shared via /s/ links (whose og:image embeds the full id) and any
// CDN-cached card URLs keep resolving. Accepting a UUID here puts a UUID
// nowhere public — it only reads one.
//
// The token is validated to be EXACTLY 12 hex (so no LIKE wildcard can ever
// reach the prefix match) and resolved as a `<8hex>-<4hex>%` id prefix. A
// 12-hex prefix is not guaranteed unique, so callers MUST fetch with take:2 and
// treat >1 match as not-found — mirroring the public SSR resolver (fetchAthleteRow).

export type IdWhere = { id: string } | { id: { startsWith: string } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TOKEN = /^[0-9a-f]{12}$/;

/**
 * Path param (a full id, or a 12-hex slug token, with an optional trailing
 * `.png`) → a Prisma id filter, or null if the param is neither shape (caller
 * then serves the neutral fallback card).
 */
export function idWhere(param: string): IdWhere | null {
  const raw = param.replace(/\.png$/i, '').toLowerCase();
  if (UUID.test(raw)) return { id: raw };                                       // full UUID → exact
  if (TOKEN.test(raw)) return { id: { startsWith: `${raw.slice(0, 8)}-${raw.slice(8, 12)}` } }; // token → id prefix
  return null;                                                                  // malformed → fallback
}
