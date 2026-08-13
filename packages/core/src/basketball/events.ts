// The basketball tracker's event vocabulary.
//
// WHY EVENTS AND NOT A STATE BLOB: two analysts scoring one game used to each
// PATCH a whole BasketballState. Neither snapshot contained the other's last few
// entries, so every save silently overwrote the other analyst's work — a rebound
// entered at 12:04.1 simply ceased to exist when the co-scorer's save landed at
// 12:04.6. Nothing errored; the row just read 0.
//
// An append-only log removes the class of bug entirely: concurrent entry is a
// union of events, never a replace. Everything a viewer needs — box score, clock,
// on-court five, shot chart — is DERIVED by folding this log (see fold.ts), so
// there is exactly one writable thing in the system and it only ever grows.
//
// It also happens to be what the rest of the feature set needs anyway: a shot
// carries its court coordinates, "remove a wrong entry" is a soft-delete of one
// id, and a per-player shot chart is a filter.

/** Stat-producing actions. Split 2PT from 3PT so a shot's value is intrinsic to
 *  its kind rather than something the fold has to infer from coordinates. */
export type ShotKind =
  | 'FG2_MADE' | 'FG2_MISS'
  | 'FG3_MADE' | 'FG3_MISS'
  | 'FT_MADE' | 'FT_MISS';

export type NonShotKind =
  | 'AST' | 'OREB' | 'DREB' | 'STL' | 'BLK' | 'TO' | 'PF';

/** Game-control actions. These are events too, so the clock and the on-court
 *  five survive a reload and a reconnect exactly like the stats do, and two
 *  admins pressing Start at once converge instead of fighting. */
export type ControlKind =
  | 'CLOCK_START' | 'CLOCK_STOP' | 'CLOCK_SET'
  | 'QUARTER_SET'
  | 'SUB' | 'LINEUP_SET'
  | 'PERIOD_BASKETS_SWAP';

export type EventKind = ShotKind | NonShotKind | ControlKind;

export const SHOT_KINDS: readonly ShotKind[] = [
  'FG2_MADE', 'FG2_MISS', 'FG3_MADE', 'FG3_MISS', 'FT_MADE', 'FT_MISS',
];
export const NON_SHOT_KINDS: readonly NonShotKind[] = [
  'AST', 'OREB', 'DREB', 'STL', 'BLK', 'TO', 'PF',
];
export const CONTROL_KINDS: readonly ControlKind[] = [
  'CLOCK_START', 'CLOCK_STOP', 'CLOCK_SET', 'QUARTER_SET',
  'SUB', 'LINEUP_SET', 'PERIOD_BASKETS_SWAP',
];
export const ALL_EVENT_KINDS: readonly EventKind[] = [
  ...SHOT_KINDS, ...NON_SHOT_KINDS, ...CONTROL_KINDS,
];

const SHOT_KIND_SET = new Set<string>(SHOT_KINDS);
const FIELD_GOAL_SET = new Set<string>(['FG2_MADE', 'FG2_MISS', 'FG3_MADE', 'FG3_MISS']);

export function isShot(kind: string): kind is ShotKind {
  return SHOT_KIND_SET.has(kind);
}
/** Field goals carry court coordinates; free throws don't (fixed location). */
export function isFieldGoal(kind: string): boolean {
  return FIELD_GOAL_SET.has(kind);
}
export function isMade(kind: string): boolean {
  return kind === 'FG2_MADE' || kind === 'FG3_MADE' || kind === 'FT_MADE';
}
/** Points a shot kind is worth (0 for a miss). */
export function pointsFor(kind: string): number {
  switch (kind) {
    case 'FG3_MADE': return 3;
    case 'FG2_MADE': return 2;
    case 'FT_MADE': return 1;
    default: return 0;
  }
}

/** Which basket a team is attacking. Stored per shot so the chart stays correct
 *  across the halftime swap without re-deriving history. */
export type Basket = 'LEFT' | 'RIGHT';

/**
 * One recorded event.
 *
 * `seq` is assigned by the server and is the total order. Clients may hold
 * optimistic events with a negative seq until the server's copy arrives.
 */
export interface TrackerEvent {
  id: string;
  matchId: string;
  seq: number;
  kind: EventKind;
  /** Platform userId. Null for team-level control events. */
  playerId: string | null;
  teamId: string | null;
  /**
   * Shot location, normalised to the FULL court: x ∈ [0,1] left→right,
   * y ∈ [0,1] top→bottom, as rendered. The raw click is stored rather than a
   * half-court projection so no information is lost if the geometry or the
   * chart's framing is ever revised. `basket` says which hoop was being
   * attacked, which is what lets fold.ts fold both halves into one chart.
   */
  x: number | null;
  y: number | null;
  basket: Basket | null;
  /** Quarter (1-based) the event belongs to. */
  quarter: number;
  /** Game clock ELAPSED in the quarter, in ms, when the event was recorded. */
  clockMs: number;
  /** Payload for control events (see ControlPayload). */
  payload: ControlPayload | null;
  /** The admin who entered it — audit, and "who typed this" in the log. */
  actorId: string | null;
  actorName?: string | null;
  createdAt: string;
  /** Soft-deleted by the "−" control. Kept for audit; the fold skips it. */
  deletedAt: string | null;
}

/** Extra data carried by control events. */
export interface ControlPayload {
  /** CLOCK_SET: elapsed ms to set the quarter clock to. */
  clockMs?: number;
  /** QUARTER_SET: quarter to move to. */
  quarter?: number;
  /** SUB: who comes off / who comes on (parallel arrays, paired by index). */
  outIds?: string[];
  inIds?: string[];
  /** LINEUP_SET: full on-court five for one side (starters, or a correction). */
  side?: 'home' | 'away';
  lineup?: string[];
  /** PERIOD_BASKETS_SWAP: which basket the HOME team now attacks. */
  homeAttacks?: Basket;
}

/** What a client sends to append an event. The server owns id, seq, actor, time. */
export interface EventDraft {
  kind: EventKind;
  playerId?: string | null;
  teamId?: string | null;
  x?: number | null;
  y?: number | null;
  basket?: Basket | null;
  quarter: number;
  clockMs: number;
  payload?: ControlPayload | null;
  /**
   * Client-generated idempotency key. A retried append after a flaky connection
   * must not record the same basket twice, so the server treats a repeat of this
   * key as the same event and returns the original.
   */
  clientId: string;
}
