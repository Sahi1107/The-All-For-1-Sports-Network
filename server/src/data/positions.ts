/**
 * Canonical position taxonomy per sport.
 *
 * Positions are stored as free text on the user profile, and the AI extracts a
 * position phrase from the natural-language query ("point guard", "striker",
 * "PG"). Radar must match the two even though they may differ in spelling,
 * abbreviation, or granularity — and even though stored values may be a mix of
 * the collapsed taxonomy ("Guard") and legacy granular labels ("Point Guard").
 *
 * Each canonical position lists the aliases that resolve to it. `normalizePosition`
 * maps any alias → canonical; `positionMatchAliases` returns every spelling to
 * match against in the DB, so a search resolves the group regardless of how a
 * given profile happens to store it.
 *
 * Basketball mirrors the collapsed Guard/Forward/Center taxonomy from
 * scripts/migrate-basketball-positions.ts. Football and cricket are a first pass
 * and are safe to tune — the shape stays the same.
 */

interface PositionGroup {
  canonical: string;
  /** Lowercase aliases. The canonical value is matched case-insensitively too. */
  aliases: string[];
}

const TAXONOMY: Record<string, PositionGroup[]> = {
  BASKETBALL: [
    { canonical: 'Guard',   aliases: ['guard', 'point guard', 'shooting guard', 'combo guard', 'pg', 'sg'] },
    { canonical: 'Forward', aliases: ['forward', 'small forward', 'power forward', 'sf', 'pf'] },
    { canonical: 'Center',  aliases: ['center', 'centre'] },
  ],
  FOOTBALL: [
    { canonical: 'Goalkeeper', aliases: ['goalkeeper', 'goal keeper', 'keeper', 'goalie', 'gk'] },
    { canonical: 'Defender',   aliases: ['defender', 'defence', 'defense', 'centre back', 'center back', 'full back', 'fullback', 'wing back', 'wingback', 'cb', 'lb', 'rb', 'lwb', 'rwb'] },
    { canonical: 'Midfielder', aliases: ['midfielder', 'midfield', 'central midfielder', 'defensive midfielder', 'attacking midfielder', 'cm', 'cdm', 'cam', 'dm', 'am'] },
    { canonical: 'Winger',     aliases: ['winger', 'left winger', 'right winger', 'wide midfielder', 'lw', 'rw'] },
    { canonical: 'Forward',    aliases: ['forward', 'striker', 'centre forward', 'center forward', 'attacker', 'cf', 'st'] },
  ],
  CRICKET: [
    { canonical: 'Batsman',      aliases: ['batsman', 'batter', 'top order', 'middle order', 'opener', 'opening batsman'] },
    { canonical: 'Bowler',       aliases: ['bowler', 'fast bowler', 'pace bowler', 'pacer', 'seamer', 'spinner', 'spin bowler', 'medium pacer'] },
    { canonical: 'All-rounder',  aliases: ['all-rounder', 'all rounder', 'allrounder'] },
    { canonical: 'Wicketkeeper', aliases: ['wicketkeeper', 'wicket keeper', 'wicket-keeper', 'keeper', 'wk'] },
  ],
};

function findGroup(sport: string | null | undefined, raw: string): PositionGroup | null {
  const groups = TAXONOMY[(sport ?? '').toUpperCase()];
  if (!groups) return null;
  const v = raw.trim().toLowerCase();
  if (!v) return null;

  // 1. Exact match on the canonical value or a known alias.
  for (const g of groups) {
    if (g.canonical.toLowerCase() === v || g.aliases.includes(v)) return g;
  }
  // 2. The phrase contains a multi-character alias, e.g. "attacking midfielder"
  //    inside "attacking midfielder / winger". The length guard stops short
  //    abbreviations (cb, pg) from matching as substrings of unrelated words.
  for (const g of groups) {
    if (g.aliases.some((a) => a.length >= 4 && v.includes(a))) return g;
  }
  return null;
}

/** Map a raw position phrase to its canonical position, or null if unknown. */
export function normalizePosition(sport: string | null | undefined, raw: string | null | undefined): string | null {
  if (!raw) return null;
  const g = findGroup(sport, raw);
  return g ? g.canonical : null;
}

/**
 * Every spelling to match a raw position against in the DB (canonical + aliases),
 * or null when the sport/position isn't in the taxonomy (caller should fall back
 * to a substring match so unknown sports don't regress).
 */
export function positionMatchAliases(sport: string | null | undefined, raw: string | null | undefined): string[] | null {
  if (!raw) return null;
  const g = findGroup(sport, raw);
  if (!g) return null;
  return Array.from(new Set([g.canonical.toLowerCase(), ...g.aliases]));
}
