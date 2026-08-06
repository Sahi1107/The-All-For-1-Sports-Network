import { publicProfileWhere } from './profileVisibility';
import { genderFromCategory } from './bulkProvision';

// ─────────────────────────────────────────────────────────────────────────────
// WHICH BOARD A TOURNAMENT BELONGS ON.
//
// Rankings are published per tournament and viewed under a Men / Women tab. The
// question "does this tournament belong on the board I'm looking at?" was
// previously answered ENTIRELY from each player's own `User.gender` — the
// tournament's own category was never consulted.
//
// That gets it wrong in the ordinary case. `User.gender` is nullable and is unset
// on most organiser-created and bulk-provisioned profiles, and the player filter
// deliberately includes `gender: null` on whichever board is being viewed (so an
// unset player isn't dropped from BOTH boards). Combine the two and a women's
// tournament whose players have no gender on file appears, in full, under Men.
//
// The tournament itself is the better evidence and is now the primary rule:
//
//   category MEN    → Men's board only
//   category WOMEN  → Women's board only
//   MIXED/OPEN/unset→ no claim; fall back to filtering by each player's gender
//
// When a tournament IS categorised the per-player filter is skipped entirely —
// having played a men's or women's tournament settles the matter more reliably
// than a profile field nobody filled in.
// ─────────────────────────────────────────────────────────────────────────────

/** The board being viewed. null = no gender filter (show everything). */
export type BoardGender = 'MALE' | 'FEMALE' | null;

/** Normalise the requested board from a query param. */
export function boardGenderFromQuery(gender: unknown): BoardGender {
  return gender === 'MALE' || gender === 'FEMALE' ? gender : null;
}

/**
 * The board a tournament claims from its category, or null when it makes no
 * claim (MIXED / OPEN / unset / unrecognised).
 */
export function tournamentBoardGender(genderCategory: string | null): BoardGender {
  return genderFromCategory(genderCategory);
}

/**
 * Does this tournament belong on the board being viewed?
 *
 * A tournament that makes no claim appears on both boards — its players are then
 * separated by their own gender, which is the only signal available. Hiding it
 * outright would lose real results for every organiser who left the field blank.
 */
export function tournamentOnBoard(genderCategory: string | null, board: BoardGender): boolean {
  if (board === null) return true;                    // no filter applied
  const claim = tournamentBoardGender(genderCategory);
  if (claim === null) return true;                    // uncategorised — show on both
  return claim === board;
}

/**
 * Should the per-player gender filter still be applied for this tournament?
 *
 * Only when the tournament makes no claim. For a categorised tournament the
 * category IS the answer, and re-applying the player filter would drop players
 * whose profile gender contradicts the event they actually played in.
 */
export function shouldFilterByPlayerGender(genderCategory: string | null): boolean {
  return tournamentBoardGender(genderCategory) === null;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE `user` CLAUSE EVERY RANKINGS QUERY MUST USE.
//
// Defined here, next to the board rules, so the list, the tournament picker and
// their counts can never disagree about who is on a board.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Per-player gender clause — the FALLBACK, applied only for a tournament whose
 * own category makes no claim (MIXED / OPEN / unset).
 *
 * `User.gender` is nullable. A strict equality match would drop an unset player
 * from the men's board AND the women's board, so someone could top an
 * uncategorised tournament's scoring and appear on no ranking anywhere. Unset is
 * therefore included on whichever board is being viewed.
 */
export function playerGenderWhere(gender: unknown): Record<string, unknown> {
  if (gender !== 'MALE' && gender !== 'FEMALE') return {};
  return { OR: [{ gender }, { gender: null }] };
}

/**
 * Visibility AND gender, composed.
 *
 * Visibility is `publicProfileWhere()` — the SAME rule the profile 404 gate uses
 * (services/profileVisibility), so a player who ranks always has a profile page
 * that opens, and vice versa. It deliberately admits UNCLAIMED profiles: a player
 * an organiser rostered without an email is `discoverable: false` to stay out of
 * people-search and Radar, but they played the matches, and leaving them off
 * would misreport the standings of the tournament they played in.
 *
 * Composed under an explicit AND because BOTH halves contribute their own `OR`
 * key — spreading them into one object would silently drop whichever came first,
 * and the failure mode is a board quietly missing every unclaimed player.
 */
export function rankedUserWhere(gender: unknown): Record<string, unknown> {
  return { AND: [publicProfileWhere(), playerGenderWhere(gender)] };
}
