// Fold an event log into everything the tracker shows: box score, clock,
// on-court five, team fouls and the shot chart.
//
// Pure and total: same events in, same picture out, on the analyst's screen, on
// a co-scorer's screen and on the server at publish time. That equality is the
// point — it's what lets two people score one game without a merge step, since
// there is no local state to merge, only a log to re-fold.

import {
  type TrackerEvent, type Basket, type ControlPayload, type ShotZone,
  isShot, isFieldGoal, isMade, pointsFor, shotZone,
} from './events';
import { toHalfCourt, courtFor, type HalfCourtPoint, type CourtGeometry } from './court';
import {
  type BasketballVariant, type BasketballRules, type GameStatus,
  rulesFor, gameStatus,
} from './variant';

export interface BoxScoreLine {
  teamId: string | null;
  secondsPlayed: number;
  pts: number; ast: number;
  reb: number; oreb: number; dreb: number;
  stl: number; blk: number; to: number; pf: number;
  /** fg/fga are TOTAL field goals (2pt + 3pt), matching the platform box score. */
  fg: number; fga: number;
  tp: number; tpa: number;
  ft: number; fta: number;
}

export function emptyLine(teamId: string | null = null): BoxScoreLine {
  return {
    teamId, secondsPlayed: 0, pts: 0, ast: 0, reb: 0, oreb: 0, dreb: 0,
    stl: 0, blk: 0, to: 0, pf: 0, fg: 0, fga: 0, tp: 0, tpa: 0, ft: 0, fta: 0,
  };
}

/** A shot, ready to plot. */
export interface DerivedShot {
  eventId: string;
  playerId: string;
  teamId: string | null;
  kind: string;
  made: boolean;
  /** What it was actually worth under this match's code: 2 or 3 in 5v5, 1 or 2
   *  in 3x3. A miss carries the value it WOULD have been worth, which is what a
   *  chart legend and a tooltip need to say. */
  value: number;
  /** Where it came from, independent of value — the stable thing to filter on. */
  zone: Exclude<ShotZone, 'FREE_THROW'>;
  quarter: number;
  clockMs: number;
  x: number;
  y: number;
  basket: Basket;
  /** Projected into the chart's frame (both ends folded together in 5v5; the
   *  single floor as-is in 3x3). */
  half: HalfCourtPoint;
}

export interface DerivedState {
  players: Record<string, BoxScoreLine>;
  onCourtHome: string[];
  onCourtAway: string[];
  quarter: number;
  /** Elapsed ms in the current quarter, as of `clockAnchorWallMs`. */
  clockMs: number;
  clockRunning: boolean;
  /** Wall-clock ms the running clock was last anchored at; null when stopped. */
  clockAnchorWallMs: number | null;
  teamFoulsHome: number[];
  teamFoulsAway: number[];
  /**
   * Points each side scored in each period (index = period − 1).
   *
   * Aggregate score can't answer "who has scored two in overtime", because 3x3
   * overtime is won by SCORING two, not by leading by two — a side that trails
   * by one and scores two has won. That question is only answerable per period,
   * so the fold carries it.
   */
  periodPointsHome: number[];
  periodPointsAway: number[];
  /** Which basket the home side is attacking right now. Always 'LEFT' where the
   *  code has a single basket. */
  homeAttacks: Basket;
  shots: DerivedShot[];
  lastSeq: number;
  /** The code this log was folded under — so a consumer of DerivedState alone
   *  can label, score and end the game correctly. */
  variant: BasketballVariant;
}

export interface FoldOptions {
  homeTeamId: string | null;
  awayTeamId: string | null;
  /** Period length in ms — the clock is clamped to it so a period someone forgot
   *  to stop can't credit 40 minutes of court time to a lineup. */
  quarterMs: number;
  /** Which code the match is played under. Defaults to 5v5, so every log written
   *  and every caller compiled before 3x3 existed folds exactly as it did. */
  variant?: BasketballVariant;
}

function blankState(variant: BasketballVariant, homeAttacks: Basket = 'LEFT'): DerivedState {
  return {
    players: {}, onCourtHome: [], onCourtAway: [],
    quarter: 1, clockMs: 0, clockRunning: false, clockAnchorWallMs: null,
    teamFoulsHome: [], teamFoulsAway: [],
    periodPointsHome: [], periodPointsAway: [],
    homeAttacks, shots: [], lastSeq: 0, variant,
  };
}

function bumpQuarterArray(arr: number[], quarter: number, by: number): number[] {
  const out = [...arr];
  const i = quarter - 1;
  if (i < 0) return out;
  while (out.length <= i) out.push(0);
  out[i] = Math.max(0, (out[i] ?? 0) + by);
  return out;
}

/**
 * Apply one stat event's effect to a line. Kept separate so a removal is
 * expressed as the same arithmetic with dir = -1 in tests.
 *
 * `rules` supplies the point values. The shot COUNTERS are code-independent —
 * `tp`/`tpa` count behind-the-arc shots whatever they're worth, so FG% and the
 * arc split stay derivable in both codes — while `pts` is the only field that
 * moves with the variant.
 */
function applyStat(line: BoxScoreLine, kind: string, dir: 1 | -1, rules: BasketballRules): BoxScoreLine {
  const n = { ...line };
  const c = (v: number) => Math.max(0, v);
  const v = rules.values;
  switch (kind) {
    case 'FG2_MADE': n.fg = c(n.fg + dir); n.fga = c(n.fga + dir); n.pts = c(n.pts + v.insideArc * dir); break;
    case 'FG2_MISS': n.fga = c(n.fga + dir); break;
    case 'FG3_MADE': n.tp = c(n.tp + dir); n.tpa = c(n.tpa + dir); n.fg = c(n.fg + dir); n.fga = c(n.fga + dir); n.pts = c(n.pts + v.behindArc * dir); break;
    case 'FG3_MISS': n.tpa = c(n.tpa + dir); n.fga = c(n.fga + dir); break;
    case 'FT_MADE': n.ft = c(n.ft + dir); n.fta = c(n.fta + dir); n.pts = c(n.pts + v.freeThrow * dir); break;
    case 'FT_MISS': n.fta = c(n.fta + dir); break;
    case 'AST': n.ast = c(n.ast + dir); break;
    case 'OREB': n.oreb = c(n.oreb + dir); n.reb = c(n.reb + dir); break;
    case 'DREB': n.dreb = c(n.dreb + dir); n.reb = c(n.reb + dir); break;
    case 'STL': n.stl = c(n.stl + dir); break;
    case 'BLK': n.blk = c(n.blk + dir); break;
    case 'TO': n.to = c(n.to + dir); break;
    case 'PF': n.pf = c(n.pf + dir); break;
  }
  return n;
}

/**
 * Fold the log.
 *
 * Events must be in server `seq` order. Soft-deleted events are skipped, which
 * is exactly what the "−" control does: it doesn't rewrite history, it marks one
 * entry dead and the next fold simply doesn't count it.
 */
export function foldEvents(
  events: readonly TrackerEvent[],
  opts: FoldOptions,
): DerivedState {
  const rules = rulesFor(opts.variant);
  const geo: CourtGeometry = courtFor(rules.variant);
  const s = blankState(rules.variant);
  const { homeTeamId, awayTeamId, quarterMs } = opts;

  let onHome = new Set<string>();
  let onAway = new Set<string>();
  const players = s.players;
  let teamFoulsHome = s.teamFoulsHome;
  let teamFoulsAway = s.teamFoulsAway;
  let periodPointsHome = s.periodPointsHome;
  let periodPointsAway = s.periodPointsAway;

  const lineFor = (playerId: string, teamId: string | null): BoxScoreLine => {
    const cur = players[playerId];
    if (cur) {
      // A line created by a stat event before we knew the side gets its team
      // filled in the first time an event carries one.
      if (!cur.teamId && teamId) cur.teamId = teamId;
      return cur;
    }
    const fresh = emptyLine(teamId);
    players[playerId] = fresh;
    return fresh;
  };

  // The clock's own timeline. Wall time comes from the server's createdAt, so a
  // closed laptop or a throttled tab can't distort it — if the game clock was
  // running, that time really did elapse, and the CLOCK_SET control is how a
  // mistake gets corrected rather than a heuristic cap.
  let clockMs = 0;
  let clockRunning = false;
  let anchorWall: number | null = null;

  /** Roll the clock forward to `wallMs`, crediting court time to the five on. */
  const advanceTo = (wallMs: number) => {
    if (!clockRunning || anchorWall === null) { anchorWall = wallMs; return; }
    const raw = Math.max(0, wallMs - anchorWall);
    // Never credit past the end of the quarter.
    const room = Math.max(0, quarterMs - clockMs);
    const delta = Math.min(raw, room);
    if (delta > 0) {
      const secs = delta / 1000;
      for (const id of onHome) lineFor(id, homeTeamId).secondsPlayed += secs;
      for (const id of onAway) lineFor(id, awayTeamId).secondsPlayed += secs;
      clockMs += delta;
    }
    anchorWall = wallMs;
  };

  let homeAttacks: Basket = 'LEFT';
  let quarter = 1;

  for (const e of events) {
    if (e.seq > s.lastSeq) s.lastSeq = e.seq;
    if (e.deletedAt) continue;
    const wall = Date.parse(e.createdAt);
    const p: ControlPayload = e.payload ?? {};

    switch (e.kind) {
      case 'CLOCK_START':
        advanceTo(wall);
        clockRunning = true;
        anchorWall = wall;
        break;
      case 'CLOCK_STOP':
        advanceTo(wall);
        clockRunning = false;
        break;
      case 'CLOCK_SET':
        // The stoppage / correction control. Takes effect from this instant;
        // whether the clock was running is deliberately unchanged, so setting
        // the time during a live ball doesn't also stop the game.
        advanceTo(wall);
        clockMs = Math.min(quarterMs, Math.max(0, p.clockMs ?? 0));
        anchorWall = wall;
        break;
      case 'QUARTER_SET':
        advanceTo(wall);
        quarter = Math.max(1, p.quarter ?? quarter + 1);
        clockMs = 0;
        clockRunning = false;
        anchorWall = wall;
        break;
      case 'PERIOD_BASKETS_SWAP':
        // Ignored where the code has a single basket: there is no other end to
        // change to, and honouring a stray swap would mirror every subsequent
        // 3x3 shot onto the wrong side of the chart.
        if (rules.twoBaskets) {
          homeAttacks = p.homeAttacks ?? (homeAttacks === 'LEFT' ? 'RIGHT' : 'LEFT');
        }
        break;
      case 'SUB': {
        advanceTo(wall);
        const outs = p.outIds ?? [];
        const ins = p.inIds ?? [];
        const side = e.teamId === homeTeamId ? onHome : e.teamId === awayTeamId ? onAway : null;
        if (side) {
          outs.forEach((o, i) => {
            const into = ins[i];
            side.delete(o);
            if (into) side.add(into);
          });
        }
        break;
      }
      case 'LINEUP_SET': {
        advanceTo(wall);
        const lineup = new Set(p.lineup ?? []);
        if (p.side === 'home') onHome = lineup;
        else if (p.side === 'away') onAway = lineup;
        break;
      }
      default: {
        // Stat event.
        if (!e.playerId) break;
        const teamId = e.teamId ?? (onHome.has(e.playerId) ? homeTeamId : onAway.has(e.playerId) ? awayTeamId : null);
        players[e.playerId] = applyStat(lineFor(e.playerId, teamId), e.kind, 1, rules);
        if (e.kind === 'PF') {
          if (teamId === homeTeamId) teamFoulsHome = bumpQuarterArray(teamFoulsHome, e.quarter, 1);
          else if (teamId === awayTeamId) teamFoulsAway = bumpQuarterArray(teamFoulsAway, e.quarter, 1);
        }
        const scored = pointsFor(e.kind, rules.values);
        if (scored > 0) {
          if (teamId === homeTeamId) periodPointsHome = bumpQuarterArray(periodPointsHome, e.quarter, scored);
          else if (teamId === awayTeamId) periodPointsAway = bumpQuarterArray(periodPointsAway, e.quarter, scored);
        }
        if (isShot(e.kind) && isFieldGoal(e.kind) && e.x != null && e.y != null && e.basket) {
          const zone = shotZone(e.kind) === 'BEHIND_ARC' ? 'BEHIND_ARC' as const : 'INSIDE_ARC' as const;
          s.shots.push({
            eventId: e.id,
            playerId: e.playerId,
            teamId,
            kind: e.kind,
            made: isMade(e.kind),
            // The value the zone is worth under THIS code — so a missed shot
            // still reports what it would have been worth, which is what the
            // chart tooltip says.
            value: zone === 'BEHIND_ARC' ? rules.values.behindArc : rules.values.insideArc,
            zone,
            quarter: e.quarter,
            clockMs: e.clockMs,
            x: e.x, y: e.y, basket: e.basket,
            half: toHalfCourt(e.x, e.y, e.basket, geo),
          });
        }
        break;
      }
    }
  }

  s.onCourtHome = [...onHome];
  s.onCourtAway = [...onAway];
  s.quarter = quarter;
  s.clockMs = clockMs;
  s.clockRunning = clockRunning;
  s.clockAnchorWallMs = clockRunning ? anchorWall : null;
  s.teamFoulsHome = teamFoulsHome;
  s.teamFoulsAway = teamFoulsAway;
  s.periodPointsHome = periodPointsHome;
  s.periodPointsAway = periodPointsAway;
  s.homeAttacks = homeAttacks;
  return s;
}

/**
 * Has this match been decided on score? Reads the fold's own totals so a caller
 * can't ask the question with a score that disagrees with the box score.
 *
 * Always `over: false` in a code with no target score (5v5) — there, the
 * organiser ends the match, exactly as before.
 */
export function derivedGameStatus(
  s: DerivedState,
  homeTeamId: string | null,
  awayTeamId: string | null,
): GameStatus {
  const i = s.quarter - 1;
  return gameStatus(rulesFor(s.variant), {
    homeScore: teamScore(s.players, homeTeamId),
    awayScore: teamScore(s.players, awayTeamId),
    period: s.quarter,
    homePeriodPoints: s.periodPointsHome[i] ?? 0,
    awayPeriodPoints: s.periodPointsAway[i] ?? 0,
  });
}

/**
 * The clock as it reads *now*, for display and for the elapsed-time credit the
 * fold can't know about (no event has happened since the clock started).
 * Callers pass `Date.now()`; kept as a parameter so it stays pure and testable.
 */
export function liveClockMs(s: DerivedState, nowWallMs: number, quarterMs: number): number {
  if (!s.clockRunning || s.clockAnchorWallMs === null) return Math.min(s.clockMs, quarterMs);
  return Math.min(quarterMs, s.clockMs + Math.max(0, nowWallMs - s.clockAnchorWallMs));
}

/** Remaining time in the quarter, as mm:ss — what a scoreboard shows. */
export function formatClock(elapsedMs: number, quarterMs: number): string {
  const remaining = Math.max(0, Math.ceil((quarterMs - elapsedMs) / 1000));
  const m = Math.floor(remaining / 60);
  const sec = remaining % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** Parse "mm:ss" (what the set-clock control accepts) into elapsed ms. */
export function parseClockToElapsedMs(input: string, quarterMs: number): number | null {
  const m = /^\s*(\d{1,2})\s*:\s*([0-5]?\d)\s*$/.exec(input);
  if (!m) return null;
  const remainingMs = (Number(m[1]) * 60 + Number(m[2])) * 1000;
  if (remainingMs > quarterMs) return null;
  return quarterMs - remainingMs;
}

/**
 * The legacy `TrackerMatch.state` shape, derived from a fold.
 *
 * The log is the source of truth; this is a READ CONVENIENCE that keeps every
 * surface which already reads `state` — the publish derivation, the spreadsheet
 * export, the stat-leader boards — working without each of them learning to fold
 * events. One definition, shared by the server's materialiser and the
 * client-only demo sandbox, so the two can't describe the same match differently.
 */
export interface BasketballSnapshot {
  quarter: number;
  quarterSeconds: number;
  clockSeconds: number;
  clockRunning: boolean;
  onCourtHome: string[];
  onCourtAway: string[];
  players: Record<string, BoxScoreLine>;
  teamFoulsHome: number[];
  teamFoulsAway: number[];
  periodPointsHome: number[];
  periodPointsAway: number[];
  /**
   * The code this was scored under. Stamped into the blob because a snapshot
   * outlives the session row a reader would otherwise have to join to, and a
   * 3x3 box score read as 5v5 would double every point on it.
   */
  variant: BasketballVariant;
  /** Shot locations, so a finished match still charts without the log. */
  shots: {
    eventId: string; playerId: string; teamId: string | null;
    made: boolean; value: number; zone: Exclude<ShotZone, 'FREE_THROW'>;
    quarter: number; clockMs: number;
    x: number; y: number; basket: Basket;
  }[];
  /** Marks the blob as derived, so nothing is tempted to write back to it. */
  derivedFromEvents: true;
  derivedAt: string;
}

export function toSnapshot(s: DerivedState, quarterSeconds: number): BasketballSnapshot {
  return {
    quarter: s.quarter,
    quarterSeconds,
    clockSeconds: s.clockMs / 1000,
    clockRunning: s.clockRunning,
    onCourtHome: s.onCourtHome,
    onCourtAway: s.onCourtAway,
    players: s.players,
    teamFoulsHome: s.teamFoulsHome,
    teamFoulsAway: s.teamFoulsAway,
    periodPointsHome: s.periodPointsHome,
    periodPointsAway: s.periodPointsAway,
    variant: s.variant,
    shots: s.shots.map((sh) => ({
      eventId: sh.eventId, playerId: sh.playerId, teamId: sh.teamId,
      made: sh.made, value: sh.value, zone: sh.zone,
      quarter: sh.quarter, clockMs: sh.clockMs,
      x: sh.x, y: sh.y, basket: sh.basket,
    })),
    derivedFromEvents: true,
    derivedAt: new Date().toISOString(),
  };
}

/** Team totals from a set of lines — the box score's footer row. */
export function teamTotals(
  players: Record<string, BoxScoreLine>,
  teamId: string | null,
): BoxScoreLine {
  const t = emptyLine(teamId);
  for (const line of Object.values(players)) {
    if (line.teamId !== teamId) continue;
    t.secondsPlayed += line.secondsPlayed;
    t.pts += line.pts; t.ast += line.ast; t.reb += line.reb;
    t.oreb += line.oreb; t.dreb += line.dreb; t.stl += line.stl;
    t.blk += line.blk; t.to += line.to; t.pf += line.pf;
    t.fg += line.fg; t.fga += line.fga; t.tp += line.tp;
    t.tpa += line.tpa; t.ft += line.ft; t.fta += line.fta;
  }
  return t;
}

/** Score for one side, derived — never stored, so it can't disagree with the log. */
export function teamScore(players: Record<string, BoxScoreLine>, teamId: string | null): number {
  let pts = 0;
  for (const line of Object.values(players)) if (line.teamId === teamId) pts += line.pts;
  return pts;
}
