// The two basketball codes this platform tracks, and everything that differs
// between them.
//
// WHY A RULES TABLE AND NOT BRANCHES: 3x3 is not "5v5 with fewer players". It
// scores differently (1 and 2, not 2 and 3), ends differently (a target score,
// not a horn), has one basket instead of two, one period instead of four, no
// player foul-out, a different bonus ladder and a different standings scheme.
// Scattering `if (variant === 'THREE_X_THREE')` through the fold, the tracker UI,
// the standings and the ranking service would put nine independent chances to get
// one game half-converted — a scoreboard reading 21 while the box score reads 34.
//
// So the differences live here as DATA, read by everything else. Adding a code
// (FIBA 3x3 juniors, a house rule, first-to-11 streetball) is a row in this file.
//
// Sources: FIBA Official Basketball Rules and the FIBA 3x3 Rules of the Game.

/** Which basketball code a tournament is played under. */
export type BasketballVariant = 'FIVE_V_FIVE' | 'THREE_X_THREE';

export const BASKETBALL_VARIANTS: readonly BasketballVariant[] = ['FIVE_V_FIVE', 'THREE_X_THREE'];

export const DEFAULT_VARIANT: BasketballVariant = 'FIVE_V_FIVE';

/**
 * Points awarded by court zone.
 *
 * The event log records a shot's ZONE (inside or behind the arc), never its
 * value — see events.ts. That is what lets one log, one fold and one shot chart
 * serve both codes: the same tap is worth 2 in a 5v5 game and 1 in a 3x3 game,
 * and nothing has to be migrated when a tournament's code is corrected.
 */
export interface ShotValues {
  /** A field goal from inside the three-point arc. */
  insideArc: number;
  /** A field goal from behind it. */
  behindArc: number;
  freeThrow: number;
}

/** What happens when a team's foul count crosses a threshold. */
export type FoulPenalty =
  /** Shooting fouls only. */
  | 'NONE'
  /** Every foul is now two free throws. */
  | 'BONUS'
  /** Two free throws AND possession — the 3x3 escalation at ten team fouls. */
  | 'BONUS_AND_POSSESSION';

/** League-table points for one result. */
export interface StandingsPoints {
  win: number;
  /** Only reachable in codes that can end level; 3x3 plays overtime instead. */
  draw: number;
  loss: number;
}

export interface BasketballRules {
  variant: BasketballVariant;
  /** Short name for headings and menus. */
  label: string;
  /** Players from one team on the floor at once. */
  playersOnCourt: number;
  /** Squad size a roster is expected to carry (3x3 is 3 + 1 substitute). */
  rosterSize: number;
  values: ShotValues;

  // ── Time ──
  /** Scheduled periods before overtime. */
  periods: number;
  /** How a period is named on the scoreboard — "Q1" or, for a single period, "P". */
  periodLabel: string;
  defaultPeriodSeconds: number;
  shotClockSeconds: number;

  // ── Ending the game ──
  /**
   * Score that ends the game outright in regulation, or null when only the clock
   * ends it. 21 in 3x3.
   */
  targetScore: number | null;
  /**
   * Points a side must score WITHIN the overtime period to win it, or null when
   * overtime is played to the clock like any other period. 2 in 3x3 — note this
   * counts points scored in overtime, not the margin, which is why the fold
   * tracks points per period.
   */
  overtimeTargetPoints: number | null;

  // ── Fouls ──
  /** Personal fouls that disqualify a player, or null when the code has no limit
   *  (3x3 does not foul players out for personal fouls). */
  foulOutLimit: number | null;
  /** Team fouls in a period at which every foul becomes free throws. */
  bonusThreshold: number;
  /** Team fouls at which the penalty escalates further, or null. */
  possessionThreshold: number | null;

  // ── Court ──
  /** Two baskets (teams change ends) or one (they never do). */
  twoBaskets: boolean;

  standingsPoints: StandingsPoints;
}

const FIVE_V_FIVE: BasketballRules = {
  variant: 'FIVE_V_FIVE',
  label: '5v5',
  playersOnCourt: 5,
  rosterSize: 12,
  values: { insideArc: 2, behindArc: 3, freeThrow: 1 },

  periods: 4,
  periodLabel: 'Q',
  defaultPeriodSeconds: 720,
  shotClockSeconds: 24,

  targetScore: null,
  overtimeTargetPoints: null,

  foulOutLimit: 5,
  bonusThreshold: 5,
  possessionThreshold: null,

  twoBaskets: true,

  // Three for a win is what the group tables have always used here, and 5v5
  // fixtures can end level in a group stage.
  standingsPoints: { win: 3, draw: 1, loss: 0 },
};

const THREE_X_THREE: BasketballRules = {
  variant: 'THREE_X_THREE',
  label: '3x3',
  playersOnCourt: 3,
  rosterSize: 4,
  // The headline difference. A shot from the same spot is worth half what it is
  // in 5v5, so a 3x3 game finishes around 21 rather than around 70 — which is
  // why the ranking board for this code needs its own REF, not a shared one.
  values: { insideArc: 1, behindArc: 2, freeThrow: 1 },

  // One period, not four. "P" rather than "Q1" because a game with a single
  // period has no quarters to number.
  periods: 1,
  periodLabel: 'P',
  defaultPeriodSeconds: 600,
  shotClockSeconds: 12,

  targetScore: 21,
  // Overtime is won by SCORING two, not by leading by two: a side that trails by
  // one and scores two wins, and the first basket does not end it. Anything that
  // reads this must therefore count points scored inside the overtime period.
  overtimeTargetPoints: 2,

  // 3x3 does not disqualify a player for personal fouls at all — there is no
  // five-foul rule to apply, and showing "OUT" against a player who is entitled
  // to keep playing would have the scorer bench them wrongly.
  foulOutLimit: null,
  bonusThreshold: 7,
  possessionThreshold: 10,

  // One basket. Teams never change ends, so the scoreboard has no swap control
  // and every shot in the log folds onto the same chart without projection.
  twoBaskets: false,

  // FIBA 3x3: two points for a win, ONE for a loss, none for a forfeit. A side
  // that turns up and loses still outranks one that does not turn up, which the
  // 3-1-0 scheme cannot express.
  standingsPoints: { win: 2, draw: 1, loss: 1 },
};

const RULES: Record<BasketballVariant, BasketballRules> = {
  FIVE_V_FIVE,
  THREE_X_THREE,
};

/** The rules for a variant. Unknown/absent input falls back to 5v5, so a row
 *  written before the column existed reads as the code it was played under. */
export function rulesFor(variant?: BasketballVariant | string | null): BasketballRules {
  return RULES[variant as BasketballVariant] ?? RULES[DEFAULT_VARIANT];
}

export function isVariant(v: unknown): v is BasketballVariant {
  return v === 'FIVE_V_FIVE' || v === 'THREE_X_THREE';
}

/**
 * The key that ranking boards and tiebreak rules are looked up by.
 *
 * 3x3 is the same SPORT as 5v5 — a basketball player, on the basketball radar,
 * with basketball positions — but a different COMPETITION, scored on a different
 * scale. This is the one string that separates the two where that matters, and
 * leaves them joined everywhere it doesn't.
 */
export function disciplineKey(sport: string, variant?: BasketballVariant | string | null): string {
  if (sport === 'BASKETBALL' && variant === 'THREE_X_THREE') return 'BASKETBALL_3X3';
  return sport;
}

/** League-table points for a result under this code. */
export function standingsPointsFor(rules: BasketballRules, result: 'win' | 'draw' | 'loss'): number {
  return rules.standingsPoints[result];
}

/** What a team's foul count in the current period costs them. */
export function foulPenalty(rules: BasketballRules, teamFoulsThisPeriod: number): FoulPenalty {
  if (rules.possessionThreshold !== null && teamFoulsThisPeriod >= rules.possessionThreshold) {
    return 'BONUS_AND_POSSESSION';
  }
  if (teamFoulsThisPeriod >= rules.bonusThreshold) return 'BONUS';
  return 'NONE';
}

/** Is this player disqualified on personal fouls? Always false where the code
 *  has no limit. */
export function isFouledOut(rules: BasketballRules, personalFouls: number): boolean {
  return rules.foulOutLimit !== null && personalFouls >= rules.foulOutLimit;
}

/** One foul from disqualification — the warning a scorer and bench need. */
export function inFoulTrouble(rules: BasketballRules, personalFouls: number): boolean {
  return rules.foulOutLimit !== null && personalFouls === rules.foulOutLimit - 1;
}

// ─── Ending the game ─────────────────────────────────────────────────────────

export interface GameProgress {
  homeScore: number;
  awayScore: number;
  /** 1-based. Anything beyond `rules.periods` is overtime. */
  period: number;
  /** Points each side has scored WITHIN the current period. Only consulted for
   *  overtime, which is decided on points scored rather than on the aggregate. */
  homePeriodPoints: number;
  awayPeriodPoints: number;
}

export type GameEndReason = 'TARGET_SCORE' | 'OVERTIME_TARGET';

export interface GameStatus {
  over: boolean;
  winner: 'HOME' | 'AWAY' | null;
  reason: GameEndReason | null;
  inOvertime: boolean;
  /** Points each side still needs to close the game out on the target score,
   *  or null in a code that has no target. Drives the "3 to win" readout. */
  homeToTarget: number | null;
  awayToTarget: number | null;
}

/**
 * Has the game been decided by SCORE alone?
 *
 * Deliberately silent about the clock. A period that has run out does not by
 * itself end a 3x3 game — the scorer confirms it, and a game tied at the horn
 * goes to overtime rather than finishing — so time is the tracker's business and
 * this stays a pure function of the score. In a code with no target score (5v5)
 * it always reports `over: false`, which is exactly today's behaviour: the
 * organiser ends the match.
 */
export function gameStatus(rules: BasketballRules, g: GameProgress): GameStatus {
  const inOvertime = g.period > rules.periods;
  const idle: GameStatus = {
    over: false, winner: null, reason: null, inOvertime,
    homeToTarget: null, awayToTarget: null,
  };

  if (inOvertime) {
    const need = rules.overtimeTargetPoints;
    if (need === null) return idle;
    // Points scored IN the overtime period, not the margin.
    if (g.homePeriodPoints >= need && g.homePeriodPoints > g.awayPeriodPoints) {
      return { ...idle, over: true, winner: 'HOME', reason: 'OVERTIME_TARGET' };
    }
    if (g.awayPeriodPoints >= need && g.awayPeriodPoints > g.homePeriodPoints) {
      return { ...idle, over: true, winner: 'AWAY', reason: 'OVERTIME_TARGET' };
    }
    return idle;
  }

  const target = rules.targetScore;
  if (target === null) return idle;

  const homeToTarget = Math.max(0, target - g.homeScore);
  const awayToTarget = Math.max(0, target - g.awayScore);
  const withTarget: GameStatus = { ...idle, homeToTarget, awayToTarget };

  // The target ends the game the moment it is reached. A side cannot pass it and
  // still be behind — you only score for yourself — so whoever is at or past it
  // has won.
  if (g.homeScore >= target && g.homeScore > g.awayScore) {
    return { ...withTarget, over: true, winner: 'HOME', reason: 'TARGET_SCORE' };
  }
  if (g.awayScore >= target && g.awayScore > g.homeScore) {
    return { ...withTarget, over: true, winner: 'AWAY', reason: 'TARGET_SCORE' };
  }
  return withTarget;
}

/**
 * Should the scorer be offered overtime? True when the clock has run out on the
 * last scheduled period with the sides level, in a code that decides overtime on
 * points. (5v5 overtime is a normal timed period and is handled by adding one.)
 */
export function needsOvertime(
  rules: BasketballRules,
  g: Pick<GameProgress, 'homeScore' | 'awayScore' | 'period'>,
  periodExpired: boolean,
): boolean {
  return (
    rules.overtimeTargetPoints !== null
    && periodExpired
    && g.period >= rules.periods
    && g.homeScore === g.awayScore
  );
}
