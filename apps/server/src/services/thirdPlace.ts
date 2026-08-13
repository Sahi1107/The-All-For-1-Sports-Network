// Toggle the knockout third-place playoff on an existing tracker draw.
//
// Third-place is normally decided at draw generation, but an organiser can turn
// it on or off later from the tournament details editor without regenerating the
// whole draw. This service does the structural surgery: adding the fixture (fed
// by the two losing semifinalists) or removing it cleanly.
//
// Removing a third-place match that has ALREADY been played destroys a result
// (and, if published, its player stats + rankings), so the route gates that
// behind an explicit confirmation — see thirdPlaceRemovalNeedsConfirm.

import prisma from '../config/db';
import { bracketAdvancements, type BracketDef } from './trackerDraw';

export const THIRD_PLACE_SLOT = 'third_place-1';

const DONE = (status: string) => status === 'COMPLETED' || status === 'PUBLISHED';

type MatchRow = {
  id: string;
  stage: string;
  bracketSlot: string | null;
  status: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number;
  awayScore: number;
  orderIndex: number;
  publishedMatchId: string | null;
};

// ─── Pure bracket queries / transforms ───────────────────────

/** A third-place playoff only makes sense when the draw reaches a semifinal. */
export function bracketHasSemis(bracket: BracketDef | null | undefined): boolean {
  return !!bracket && bracket.slots.some((s) => s.stage === 'sf');
}

export function bracketHasThirdPlace(bracket: BracketDef | null | undefined): boolean {
  return !!bracket && bracket.slots.some((s) => s.stage === 'third_place');
}

/** Add the third-place slot, fed by the two semifinal slots. Pure + idempotent. */
export function addThirdPlace(bracket: BracketDef): BracketDef {
  if (bracketHasThirdPlace(bracket)) return { ...bracket, includesThirdPlace: true };
  const sfs = bracket.slots.filter((s) => s.stage === 'sf');
  return {
    stages: bracket.stages.includes('third_place') ? bracket.stages : [...bracket.stages, 'third_place'],
    slots: [...bracket.slots, { id: THIRD_PLACE_SLOT, stage: 'third_place', feedFrom: [sfs[0]?.id, sfs[1]?.id] }],
    includesThirdPlace: true,
  };
}

/** Strip the third-place slot + stage from a bracket. Pure. */
export function removeThirdPlace(bracket: BracketDef): BracketDef {
  return {
    stages: bracket.stages.filter((s) => s !== 'third_place'),
    slots: bracket.slots.filter((s) => s.stage !== 'third_place'),
    includesThirdPlace: false,
  };
}

/** Seed the third-place match from any already-completed semifinals (the losers).
 *  Reuses bracketAdvancements so the home/away side matches the rest of the
 *  bracket's feed order. Semis not yet played are filled later by propagation. */
export function thirdPlaceSeedFromSemis(
  newBracket: BracketDef,
  completedSemis: Pick<MatchRow, 'bracketSlot' | 'homeTeamId' | 'awayTeamId' | 'homeScore' | 'awayScore'>[],
): { home: string | null; away: string | null } {
  let home: string | null = null;
  let away: string | null = null;
  for (const sf of completedSemis) {
    for (const adv of bracketAdvancements(newBracket, sf)) {
      if (adv.slotId !== THIRD_PLACE_SLOT) continue;
      if (adv.side === 'home') home = adv.teamId; else away = adv.teamId;
    }
  }
  return { home, away };
}

export function thirdPlaceMatch<T extends { stage: string }>(matches: T[]): T | null {
  return matches.find((m) => m.stage === 'third_place') ?? null;
}

/** Disabling third-place destroys a result only once the match has been played. */
export function thirdPlaceRemovalNeedsConfirm(match: { status: string } | null): boolean {
  return !!match && DONE(match.status);
}

function withThirdPlace(config: unknown, value: boolean): object {
  return { ...((config as object) ?? {}), thirdPlace: value };
}

// ─── DB application ──────────────────────────────────────────

/** Apply an enable/disable of the third-place playoff to an existing session's
 *  bracket + fixtures. The caller must already have gated the destructive case
 *  (a played third-place match) behind a confirmation. Returns the platform Match
 *  id that was removed, if any, so the caller can recompute rankings. */
export async function applyThirdPlaceChange(
  session: { id: string; bracket: unknown; config: unknown },
  matches: MatchRow[],
  enabled: boolean,
): Promise<{ changed: boolean; removedPublishedMatchId: string | null }> {
  const bracket = session.bracket as BracketDef | null;
  if (!bracketHasSemis(bracket)) return { changed: false, removedPublishedMatchId: null };
  const existing = thirdPlaceMatch(matches);

  if (enabled) {
    if (existing) return { changed: false, removedPublishedMatchId: null };
    const newBracket = addThirdPlace(bracket!);
    const completedSemis = matches.filter((m) => m.stage === 'sf' && DONE(m.status));
    const seed = thirdPlaceSeedFromSemis(newBracket, completedSemis);
    const nextOrder = Math.max(0, ...matches.map((m) => m.orderIndex)) + 1;
    await prisma.$transaction(async (tx) => {
      await tx.trackerMatch.create({
        data: {
          sessionId: session.id,
          stage: 'third_place',
          round: 'Third place',
          bracketSlot: THIRD_PLACE_SLOT,
          orderIndex: nextOrder,
          homeTeamId: seed.home,
          awayTeamId: seed.away,
        },
      });
      await tx.trackerSession.update({
        where: { id: session.id },
        data: { bracket: newBracket as object, config: withThirdPlace(session.config, true) },
      });
    });
    return { changed: true, removedPublishedMatchId: null };
  }

  // Disabling.
  if (!existing) return { changed: false, removedPublishedMatchId: null };
  const removedPublishedMatchId = existing.publishedMatchId ?? null;
  const newBracket = removeThirdPlace(bracket!);
  await prisma.$transaction(async (tx) => {
    if (removedPublishedMatchId) {
      // Deleting the platform Match cascades its per-player stat rows away.
      await tx.match.deleteMany({ where: { id: removedPublishedMatchId } });
    }
    await tx.trackerMatch.delete({ where: { id: existing.id } });
    await tx.trackerSession.update({
      where: { id: session.id },
      data: { bracket: newBracket as object, config: withThirdPlace(session.config, false) },
    });
  });
  return { changed: true, removedPublishedMatchId };
}
