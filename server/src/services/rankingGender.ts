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
