// Display labels for a tournament's gender and age category.
//
// Both are FREE TEXT in the database. The admin form offers a fixed list
// (MEN / WOMEN / MIXED / OPEN, and U12…MASTERS), but the organiser's tournament
// editor lets them type, so "Men's", "Womens", "Boys", "Under 19" and "u-16" all
// occur in real rows. The parsing here mirrors genderFromCategory in
// server/src/services/bulkProvision.ts — the same spellings the ranking boards
// already treat as men's and women's must read that way on a card, or the same
// tournament would appear to say two different things.
//
// Anything unrecognised is shown AS TYPED rather than dropped: an organiser who
// wrote something we don't have a rule for still meant it to be seen.

/** Strip apostrophes and case so MEN'S / MEN’S / mens all normalise to MENS. */
const canon = (raw: string): string => raw.trim().toUpperCase().replace(/['’‘`]/g, '');

/** "OPEN" → "Open". Leaves mixed-case input (already human) alone. */
const titleCase = (s: string): string =>
  s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s;

/**
 * Human label for the gender category, or null when nothing is set.
 * MIXED and OPEN are shown too — an organiser who chose them said something
 * about the event, and hiding it would read as "not set".
 */
export function genderCategoryLabel(raw?: string | null): string | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  const c = canon(v);
  // WOMEN before MEN, anchored, so "WOMEN" can never be caught by the MEN rule.
  if (/^(WOMENS?|FEMALES?|GIRLS?|LADIES|W|F)$/.test(c)) return 'Women';
  if (/^(MENS?|MALES?|BOYS?|M)$/.test(c)) return 'Men';
  if (c === 'MIXED' || c === 'CO-ED' || c === 'COED') return 'Mixed';
  if (c === 'OPEN') return 'Open';
  return titleCase(v);
}

/**
 * Human label for the age category, or null when nothing is set.
 * U-forms are normalised ("Under 19", "u-19" → "U19"); everything else is shown
 * as typed, title-cased when it was shouted.
 */
export function ageCategoryLabel(raw?: string | null): string | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  const u = canon(v).replace(/[\s-]/g, '').match(/^U(?:NDER)?(\d{1,2})$/);
  if (u) return `U${u[1]}`;
  const over = canon(v).replace(/[\s-]/g, '').match(/^(?:O|OVER)(\d{1,2})$/);
  if (over) return `O${over[1]}`;
  return titleCase(v);
}

/** Both labels, in the order they should read: "Women · U19". Empty when neither is set. */
export function categoryLabels(t: { genderCategory?: string | null; ageCategory?: string | null }): string[] {
  return [genderCategoryLabel(t.genderCategory), ageCategoryLabel(t.ageCategory)]
    .filter((x): x is string => !!x);
}
