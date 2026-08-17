// Materialise a basketball match's event log into the `TrackerMatch.state` shape.
//
// The log is the source of truth (see the TrackerEvent model). This snapshot is
// a READ CONVENIENCE, written from the log and never written to: it keeps every
// surface that already reads `state` — the publish derivation, the spreadsheet
// export, the stat-leader boards, the public box score — working unchanged,
// without each of them having to learn to fold events.
//
// The rule that keeps the two from ever disagreeing in a way that matters: any
// path that PUBLISHES a result re-folds first, so a published box score is
// derived from the log at that instant rather than from whatever the snapshot
// happened to hold.

import prisma from '../config/db';
import {
  foldEvents, toSnapshot, rulesFor,
  type TrackerEvent as CoreTrackerEvent,
  type BasketballSnapshot as BasketballStateSnapshot,
  type BasketballVariant,
} from '@af1/core';

export type { BasketballSnapshot as BasketballStateSnapshot } from '@af1/core';

function toCoreEvent(row: {
  id: string; matchId: string; seq: bigint; kind: string;
  playerId: string | null; teamId: string | null;
  x: number | null; y: number | null; basket: string | null;
  quarter: number; clockMs: number; payload: unknown;
  clientId: string; actorId: string | null;
  createdAt: Date; deletedAt: Date | null;
}): CoreTrackerEvent {
  return {
    id: row.id,
    matchId: row.matchId,
    seq: Number(row.seq),
    kind: row.kind as CoreTrackerEvent['kind'],
    playerId: row.playerId,
    teamId: row.teamId,
    x: row.x,
    y: row.y,
    basket: row.basket as CoreTrackerEvent['basket'],
    quarter: row.quarter,
    clockMs: row.clockMs,
    payload: (row.payload ?? null) as CoreTrackerEvent['payload'],
    clientId: row.clientId,
    actorId: row.actorId,
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
  };
}

/**
 * Build the snapshot from an already-loaded log. Pure — this is the half that
 * decides what a published box score says, so it is kept free of the database
 * and tested directly.
 */
export function buildSnapshot(events: CoreTrackerEvent[], opts: {
  homeTeamId: string | null;
  awayTeamId: string | null;
  quarterSeconds: number;
  /** Which code the match was played under. Absent ⇒ 5v5, which is what every
   *  match logged before 3x3 existed was. */
  variant?: BasketballVariant;
}): BasketballStateSnapshot {
  return toSnapshot(
    foldEvents(events, {
      homeTeamId: opts.homeTeamId,
      awayTeamId: opts.awayTeamId,
      quarterMs: opts.quarterSeconds * 1000,
      variant: opts.variant,
    }),
    opts.quarterSeconds,
  );
}

/**
 * Re-fold a basketball match and persist the snapshot (plus the scores it
 * implies) onto the TrackerMatch row.
 *
 * Scores are rewritten here too rather than trusted: the append path keeps them
 * in step with a delta, but this is the moment a result becomes official, and an
 * official score should come from a full re-read of the log rather than from an
 * accumulation nobody has re-checked since tip-off.
 *
 * A no-op for matches with no events — football, and basketball fixtures scored
 * before this existed, keep whatever state they already have.
 */
export async function materializeBasketballState(matchId: string): Promise<{
  state: BasketballStateSnapshot;
  homeScore: number;
  awayScore: number;
} | null> {
  const match = await prisma.trackerMatch.findUnique({
    where: { id: matchId },
    select: {
      id: true, homeTeamId: true, awayTeamId: true,
      session: { select: { sport: true, variant: true, config: true } },
    },
  });
  if (!match || match.session.sport !== 'BASKETBALL') return null;

  const rows = await prisma.trackerEvent.findMany({
    where: { matchId },
    orderBy: { seq: 'asc' },
  });
  // No events means nothing was tracked here — football, or a basketball fixture
  // scored before this existed. Leave whatever state it already has alone rather
  // than overwriting a real result with an empty one.
  if (rows.length === 0) return null;

  const config = (match.session.config ?? {}) as { quarterSeconds?: number };
  const variant = match.session.variant as BasketballVariant;
  const snapshot = buildSnapshot(rows.map(toCoreEvent), {
    homeTeamId: match.homeTeamId,
    awayTeamId: match.awayTeamId,
    // A 3x3 period is 10 minutes, not 12 — the fold clamps court time to it, so
    // taking the 5v5 default here would credit minutes nobody played.
    quarterSeconds: config.quarterSeconds ?? rulesFor(variant).defaultPeriodSeconds,
    variant,
  });

  let homeScore = 0;
  let awayScore = 0;
  for (const line of Object.values(snapshot.players)) {
    if (line.teamId && line.teamId === match.homeTeamId) homeScore += line.pts;
    else if (line.teamId && line.teamId === match.awayTeamId) awayScore += line.pts;
  }

  await prisma.trackerMatch.update({
    where: { id: matchId },
    data: { state: snapshot as unknown as object, homeScore, awayScore },
  });
  lastMaterializedAt.set(matchId, Date.now());
  return { state: snapshot, homeScore, awayScore };
}

/** When each match's snapshot was last written, for the throttle below. */
const lastMaterializedAt = new Map<string, number>();
const THROTTLE_MS = 5_000;

/**
 * Refresh the snapshot, but at most once every few seconds per match.
 *
 * Called from the append path so surfaces that read `state` — the spreadsheet
 * export, the stat-leader boards — stay roughly live during a game, without
 * paying a full re-fold on every single tap of a busy possession.
 *
 * Best-effort by design: a skipped or failed refresh costs a slightly stale
 * convenience read, never a lost entry, because the log it derives from has
 * already been committed. Anything that must be exact (publishing, completing a
 * match) calls materializeBasketballState directly instead.
 */
export async function materializeThrottled(matchId: string): Promise<void> {
  const last = lastMaterializedAt.get(matchId) ?? 0;
  if (Date.now() - last < THROTTLE_MS) return;
  // Claim the window up front so concurrent appends don't all fold at once.
  lastMaterializedAt.set(matchId, Date.now());
  try {
    await materializeBasketballState(matchId);
  } catch (err) {
    console.error('[tracker] snapshot refresh failed (non-fatal):', err);
  }
}
