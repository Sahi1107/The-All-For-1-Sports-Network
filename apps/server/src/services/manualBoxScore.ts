import type { Sport } from '@prisma/client';
import prisma from '../config/db';
import { writeMatchPlayerStats, type PlayerStatEntry } from './matchStats';
import { backfillGenderFromTournament } from './genderBackfill';
import { recalculateTournamentRankings } from './rankingService';
import { captureException } from '../config/sentry';
import { fanoutMatchResult, fanoutStatsVerified } from './notifications/competitionNotify';

// ─────────────────────────────────────────────────────────────────────────────
// MANUAL BOX SCORES
//
// Not every match gets tracked live. A scorer is unavailable, the venue has no
// signal, or the game was played before the organiser started using the tracker —
// and the result exists only on a paper scoresheet. This module lets an organiser
// type that box score in afterwards and have it count for everything a tracked
// match counts for: it IS the result, it publishes per-player stats to profiles,
// and it feeds the ranking boards.
//
// It deliberately reuses the tracker's publish pipeline rather than duplicating
// it (writeMatchPlayerStats → backfillGenderFromTournament →
// recalculateTournamentRankings → fanout). The only genuinely new work here is
// turning a hand-typed box score into the same PlayerStatEntry[] the tracker
// derives from its live state, and checking that what was typed is internally
// consistent — because unlike the tracker, nothing upstream guarantees it is.
//
// TWO RULES CARRY THE WEIGHT:
//
//  1. DNP MEANS NO ROW — never a row of zeros.
//     Rankings average per game as (sum of game scores) / (number of stat rows)
//     — see rankBoard in services/rankingService. A zero row for a player who
//     didn't dress would count as a game they played badly, quietly dragging down
//     the per-game average that decides their rank. Absence is the only correct
//     encoding, and it matches how a real box score prints DNP.
//
//  2. THE BOX SCORE IS THE RESULT.
//     Team scores are DERIVED by summing the players' scoring, never typed
//     separately. A hand-entered final score that disagrees with the box score it
//     came from is the single most likely data-entry error, and deriving makes it
//     unrepresentable rather than something to validate after the fact.
// ─────────────────────────────────────────────────────────────────────────────

/** Thrown for a box score that can't be accepted. `field` locates it in the UI. */
export class BoxScoreError extends Error {
  code: string;
  /** e.g. "home.2.points" — team, row index, stat — so the client can focus it. */
  field?: string;
  constructor(message: string, code = 'INVALID_BOX_SCORE', field?: string) {
    super(message);
    this.name = 'BoxScoreError';
    this.code = code;
    this.field = field;
  }
}

/** One player's line. `played: false` is a DNP — carries no stats and writes no row. */
export interface BoxScoreLine {
  userId: string;
  played: boolean;
  stats?: Record<string, number>;
}

export interface BoxScoreInput {
  home: BoxScoreLine[];
  away: BoxScoreLine[];
}

/** Sports with per-player stat tables and ranking boards. Others can't be entered. */
export const BOX_SCORE_SPORTS = new Set<string>(['BASKETBALL', 'FOOTBALL', 'CRICKET']);

const n = (v: unknown): number => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

// ─── Per-sport field contracts ───────────────────────────────────────────────

/**
 * The stat a team's score is the sum of. This is what makes the box score the
 * result: basketball totals points, football goals, cricket runs.
 */
const SCORE_FIELD: Record<string, string> = {
  BASKETBALL: 'points',
  FOOTBALL: 'goals',
  CRICKET: 'runs',
};

/** Team score = sum of the scoring stat across players who actually played. */
export function deriveTeamScore(sport: Sport, lines: BoxScoreLine[]): number {
  const field = SCORE_FIELD[sport as string];
  if (!field) return 0;
  return lines.reduce((sum, l) => (l.played ? sum + n(l.stats?.[field]) : sum), 0);
}

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Basketball line consistency. These are the checks a paper scoresheet is already
 * subject to, so failing them means a typo, not an unusual game:
 *
 *   • makes never exceed attempts, at every level
 *   • three-pointers are a SUBSET of field goals (the sample format's FGM/FGA are
 *     totals including threes — the schema stores twoPointers = FGM − 3PM, which
 *     goes negative and corrupts the stat line if 3PM > FGM)
 *   • points must equal 2·(FGM−3PM) + 3·3PM + FTM exactly. Basketball scoring is
 *     closed-form, so any disagreement is an error rather than a judgement call.
 *   • offensive + defensive rebounds cannot exceed the total
 */
function validateBasketballLine(s: Record<string, number>, where: string): void {
  const fgm = n(s.fieldGoalsMade), fga = n(s.fieldGoalAttempts);
  const tpm = n(s.threePointers), tpa = n(s.threePointAttempts);
  const ftm = n(s.freeThrows), fta = n(s.freeThrowAttempts);
  const pts = n(s.points);
  const reb = n(s.rebounds), oreb = n(s.offRebounds), dreb = n(s.defRebounds);

  if (fgm > fga) throw new BoxScoreError(`Field goals made (${fgm}) exceed attempts (${fga})`, 'INVALID_BOX_SCORE', `${where}.fieldGoalsMade`);
  if (tpm > tpa) throw new BoxScoreError(`3-pointers made (${tpm}) exceed attempts (${tpa})`, 'INVALID_BOX_SCORE', `${where}.threePointers`);
  if (ftm > fta) throw new BoxScoreError(`Free throws made (${ftm}) exceed attempts (${fta})`, 'INVALID_BOX_SCORE', `${where}.freeThrows`);
  if (tpm > fgm) throw new BoxScoreError(`3-pointers made (${tpm}) exceed total field goals (${fgm}) — FGM includes threes`, 'INVALID_BOX_SCORE', `${where}.threePointers`);
  if (tpa > fga) throw new BoxScoreError(`3-point attempts (${tpa}) exceed total field-goal attempts (${fga}) — FGA includes threes`, 'INVALID_BOX_SCORE', `${where}.threePointAttempts`);

  const expected = 2 * (fgm - tpm) + 3 * tpm + ftm;
  if (pts !== expected) {
    throw new BoxScoreError(
      `Points (${pts}) don't match the shooting line — ${fgm - tpm}×2 + ${tpm}×3 + ${ftm}×1 = ${expected}`,
      'POINTS_MISMATCH', `${where}.points`,
    );
  }

  // Rebounds are entered as a TOTAL (as printed on a scoresheet) with an optional
  // offensive split. Only the split is checked here; the defensive half is derived
  // in toPlayerStats — see the note there for why that matters to rankings.
  if (oreb > reb) {
    throw new BoxScoreError(
      `Offensive rebounds (${oreb}) exceed the total (${reb})`,
      'INVALID_BOX_SCORE', `${where}.offRebounds`,
    );
  }
  if (dreb > 0 && oreb + dreb > reb) {
    throw new BoxScoreError(
      `Offensive (${oreb}) + defensive (${dreb}) rebounds exceed the total (${reb})`,
      'INVALID_BOX_SCORE', `${where}.rebounds`,
    );
  }
}

/** Football: a scorer can't assist their own goal count beyond shots taken. */
function validateFootballLine(s: Record<string, number>, where: string): void {
  const goals = n(s.goals), shots = n(s.shots);
  if (goals > shots) {
    throw new BoxScoreError(`Goals (${goals}) exceed shots (${shots}) — every goal is also a shot`, 'INVALID_BOX_SCORE', `${where}.goals`);
  }
  if (n(s.redCards) > 1) {
    throw new BoxScoreError('A player cannot be sent off more than once', 'INVALID_BOX_SCORE', `${where}.redCards`);
  }
}

/** Cricket: boundaries are a subset of the runs scored off the bat. */
function validateCricketLine(s: Record<string, number>, where: string): void {
  const runs = n(s.runs), fours = n(s.fours), sixes = n(s.sixes);
  if (fours * 4 + sixes * 6 > runs) {
    throw new BoxScoreError(
      `Boundaries (${fours}×4 + ${sixes}×6 = ${fours * 4 + sixes * 6}) exceed runs scored (${runs})`,
      'INVALID_BOX_SCORE', `${where}.runs`,
    );
  }
}

/**
 * Validate one side of the box score. Pure — no I/O — so the client can run the
 * same rules as it types and the server can enforce them without trusting it.
 */
export function validateSide(sport: Sport, lines: BoxScoreLine[], side: 'home' | 'away'): void {
  const seen = new Set<string>();
  lines.forEach((line, i) => {
    if (!line?.userId) throw new BoxScoreError('A box score line has no player', 'INVALID_BOX_SCORE', `${side}.${i}`);
    if (seen.has(line.userId)) {
      throw new BoxScoreError('The same player appears twice in one box score', 'DUPLICATE_PLAYER', `${side}.${i}`);
    }
    seen.add(line.userId);

    if (!line.played) return; // DNP — no stats to check, and no row will be written

    const s = line.stats ?? {};
    for (const [k, v] of Object.entries(s)) {
      if (!Number.isFinite(v)) throw new BoxScoreError(`"${k}" is not a number`, 'INVALID_BOX_SCORE', `${side}.${i}.${k}`);
      if (v < 0) throw new BoxScoreError(`"${k}" cannot be negative`, 'INVALID_BOX_SCORE', `${side}.${i}.${k}`);
    }

    const where = `${side}.${i}`;
    if (sport === 'BASKETBALL') validateBasketballLine(s, where);
    else if (sport === 'FOOTBALL') validateFootballLine(s, where);
    else if (sport === 'CRICKET') validateCricketLine(s, where);
  });
}

/** Validate the whole box score. At least one player must have actually played. */
export function validateBoxScore(sport: Sport, input: BoxScoreInput): void {
  if (!BOX_SCORE_SPORTS.has(sport as string)) {
    throw new BoxScoreError(`Box scores aren't supported for ${sport} yet`, 'UNSUPPORTED_SPORT');
  }
  validateSide(sport, input.home ?? [], 'home');
  validateSide(sport, input.away ?? [], 'away');

  const played = [...(input.home ?? []), ...(input.away ?? [])].filter((l) => l.played);
  if (played.length === 0) {
    throw new BoxScoreError('Every player is marked DNP — there is no match to record', 'EMPTY_BOX_SCORE');
  }

  // The same person can't turn out for both sides of the same match.
  const homeIds = new Set((input.home ?? []).map((l) => l.userId));
  const bothSides = (input.away ?? []).find((l) => homeIds.has(l.userId));
  if (bothSides) {
    throw new BoxScoreError('A player appears on both teams', 'DUPLICATE_PLAYER');
  }
}

// ─── Conversion to the platform stat shape ───────────────────────────────────

/**
 * Turn validated box score lines into the PlayerStatEntry[] that
 * writeMatchPlayerStats consumes — the exact shape the tracker produces, so both
 * paths write identical rows and everything downstream is none the wiser.
 *
 * DNP lines are dropped here. That is the single place rule 1 is enforced.
 */
export function toPlayerStats(sport: Sport, input: BoxScoreInput): PlayerStatEntry[] {
  const lines = [...(input.home ?? []), ...(input.away ?? [])].filter((l) => l.played);

  return lines.map((l) => {
    const s = l.stats ?? {};
    if (sport === 'BASKETBALL') {
      const fgm = n(s.fieldGoalsMade);
      const tpm = n(s.threePointers);
      const reb = n(s.rebounds);
      const oreb = n(s.offRebounds);
      // THE RANKING SCORE WEIGHTS offRebounds AND defRebounds, NOT the total (see
      // RANKING_CONFIG.BASKETBALL). A paper scoresheet usually prints only a total
      // REB column, so taking it literally would leave both split fields at 0 and
      // award a dominant rebounder no rebounding credit at all.
      //
      // So an unsplit total is credited entirely as DEFENSIVE rebounds. That is
      // the conservative reading — defensive carries the lower weight (0.30 vs
      // 0.45) — and it never invents an offensive split the sheet didn't record.
      // An organiser who does have the split enters it and gets the exact figure.
      const dreb = n(s.defRebounds) || Math.max(0, reb - oreb);
      return {
        userId: l.userId,
        stats: {
          points: n(s.points),
          rebounds: reb,
          offRebounds: oreb,
          defRebounds: dreb,
          assists: n(s.assists),
          steals: n(s.steals),
          blocks: n(s.blocks),
          // The form takes FGM as a TOTAL (as printed on a box score); the schema
          // stores two-pointers separately. Validation has already guaranteed
          // tpm <= fgm, so this can't go negative.
          twoPointers: fgm - tpm,
          threePointers: tpm,
          freeThrows: n(s.freeThrows),
          fieldGoalAttempts: n(s.fieldGoalAttempts),
          threePointAttempts: n(s.threePointAttempts),
          freeThrowAttempts: n(s.freeThrowAttempts),
          turnovers: n(s.turnovers),
          personalFouls: n(s.personalFouls),
          minutesPlayed: n(s.minutesPlayed),
        },
      };
    }
    if (sport === 'FOOTBALL') {
      return {
        userId: l.userId,
        stats: {
          goals: n(s.goals), assists: n(s.assists), shots: n(s.shots), passes: n(s.passes),
          tackles: n(s.tackles), saves: n(s.saves), yellowCards: n(s.yellowCards),
          redCards: n(s.redCards), minutesPlayed: n(s.minutesPlayed),
        },
      };
    }
    // CRICKET — strike rate and economy are derived, never typed, so a correction
    // to runs or balls can't leave a stale rate behind.
    const runs = n(s.runs), balls = n(s.ballsFaced);
    const overs = n(s.oversBowled), conceded = n(s.runsConceded);
    return {
      userId: l.userId,
      stats: {
        runs, ballsFaced: balls, fours: n(s.fours), sixes: n(s.sixes),
        wickets: n(s.wickets), oversBowled: overs, runsConceded: conceded,
        catches: n(s.catches), runOuts: n(s.runOuts),
        strikeRate: balls > 0 ? Math.round((runs / balls) * 10000) / 100 : 0,
        economy: overs > 0 ? Math.round((conceded / overs) * 100) / 100 : 0,
      },
    };
  });
}

// ─── Roster authority ────────────────────────────────────────────────────────

/**
 * Both teams must be registered in THIS tournament, and every player named must be
 * on the roster of the side they're listed under.
 *
 * This is the security boundary of the whole feature. A box score writes rows into
 * a player's career totals and their ranking position; without this check an
 * organiser could type any userId on the platform into a sheet and permanently
 * attach stats — and a rank — to someone who never played the match. Membership is
 * checked regardless of ACCEPTED status, because a player added mid-tournament is
 * legitimately on the sheet before any invite dance completes.
 *
 * Shared by both entry points (standalone match and tracker fixture) so the two
 * can never diverge on who is allowed to appear in a box score.
 */
export async function assertBoxScoreRosters(
  tournamentId: string,
  homeTeamId: string,
  awayTeamId: string,
  home: { userId: string }[],
  away: { userId: string }[],
): Promise<void> {
  const teams = await prisma.team.findMany({
    where: { id: { in: [homeTeamId, awayTeamId] }, tournamentId },
    select: { id: true, name: true, members: { select: { userId: true } } },
  });
  if (teams.length !== 2) {
    throw new BoxScoreError('Both teams must be registered in this tournament', 'TEAM_NOT_IN_TOURNAMENT');
  }
  for (const [teamId, lines, side] of [[homeTeamId, home, 'home'], [awayTeamId, away, 'away']] as const) {
    const team = teams.find((t) => t.id === teamId)!;
    const roster = new Set(team.members.map((m) => m.userId));
    const stranger = lines.find((l) => !roster.has(l.userId));
    if (stranger) {
      throw new BoxScoreError(
        `A player in the ${side} box score isn't on ${team.name}'s roster. Add them to the team first.`,
        'PLAYER_NOT_ON_ROSTER', side,
      );
    }
  }
}

// ─── Publish ─────────────────────────────────────────────────────────────────

export interface PublishBoxScoreArgs {
  tournamentId: string;
  sport: Sport;
  homeTeamId: string;
  awayTeamId: string;
  boxScore: BoxScoreInput;
  matchDate: Date;
  round?: string | null;
  court?: string | null;
  enteredById: string;
  /** Set when correcting an existing MANUAL match; omit to create a new one. */
  matchId?: string;
}

export interface PublishBoxScoreResult {
  matchId: string;
  homeScore: number;
  awayScore: number;
  /** Players who actually played — the number of stat rows written. */
  playerCount: number;
}

/**
 * Write a manual box score through the SAME pipeline a tracked match publishes
 * through, so a hand-entered result is indistinguishable downstream:
 *
 *   Match (result) → per-player stats (profiles) → gender backfill → rankings
 *
 * Correcting re-runs the whole thing. Stat rows are upserted by (matchId, userId),
 * so edited numbers overwrite in place; rows for players REMOVED from the box
 * score are deleted first, otherwise a player deleted from the sheet would keep a
 * stat row (and a game in their per-game average) forever.
 */
export async function publishBoxScore(args: PublishBoxScoreArgs): Promise<PublishBoxScoreResult> {
  const { tournamentId, sport, homeTeamId, awayTeamId, boxScore, enteredById } = args;

  validateBoxScore(sport, boxScore);

  const homeScore = deriveTeamScore(sport, boxScore.home ?? []);
  const awayScore = deriveTeamScore(sport, boxScore.away ?? []);
  const playerStats = toPlayerStats(sport, boxScore);

  // 1 · The match row — the result itself.
  let matchId = args.matchId;
  if (matchId) {
    await prisma.match.update({
      where: { id: matchId },
      data: {
        homeTeamId, awayTeamId, homeScore, awayScore,
        matchDate: args.matchDate, round: args.round ?? null, court: args.court ?? null,
        status: 'COMPLETED', statsSource: 'MANUAL', enteredById,
      },
    });
  } else {
    const created = await prisma.match.create({
      data: {
        tournamentId, homeTeamId, awayTeamId, homeScore, awayScore,
        matchDate: args.matchDate, round: args.round ?? null, court: args.court ?? null,
        status: 'COMPLETED', statsSource: 'MANUAL', enteredById,
      },
      select: { id: true },
    });
    matchId = created.id;
  }

  // 2 · Per-player stats onto profiles. Drop rows for anyone no longer in the box
  //     score BEFORE upserting, so a correction that removes a player (or flips
  //     them to DNP) doesn't strand a row that still counts as a game played.
  const keepUserIds = playerStats.map((p) => p.userId);
  const model = sport === 'BASKETBALL' ? prisma.basketballStats
    : sport === 'FOOTBALL' ? prisma.footballStats
    : prisma.cricketStats;
  await (model as { deleteMany: (a: unknown) => Promise<unknown> }).deleteMany({
    where: { matchId, ...(keepUserIds.length > 0 && { userId: { notIn: keepUserIds } }) },
  });
  await writeMatchPlayerStats({ matchId, tournamentId, sport, playerStats });

  // 3 · Fill in gender from the tournament category, or players with none sit on
  //     neither ranking board despite having a published result.
  await backfillGenderFromTournament(tournamentId, keepUserIds);

  // 4 · Rankings derive from published stats. AWAITED here, unlike the tracker's
  //     fire-and-forget: entering a box score is a deliberate one-shot action and
  //     the organiser expects the boards to reflect it when the call returns. A
  //     failure still must not lose the stats already written, so it's caught.
  try {
    await recalculateTournamentRankings(tournamentId);
  } catch (e) {
    console.error('ranking recompute (manual box score) failed', e);
    captureException(e, { where: 'ranking.recompute', phase: 'manual_box_score', tournamentId, matchId });
  }

  return { matchId, homeScore, awayScore, playerCount: playerStats.length };
}

/**
 * Read back the stat rows a match wrote, in the shape the ENTRY FORM uses — the
 * inverse of toPlayerStats. Two conversions matter:
 *
 *   • twoPointers + threePointers collapse back into a single FGM total, because
 *     that is how a box score is printed and how the form takes it.
 *   • cricket's strikeRate/economy are dropped — they're derived on write, so
 *     re-showing them as editable would invite an inconsistent correction.
 */
export interface LoadedStatRow {
  userId: string;
  [stat: string]: string | number;
}

export async function loadStatRows(sport: Sport, matchId: string): Promise<LoadedStatRow[]> {
  if (sport === 'BASKETBALL') {
    const rows = await prisma.basketballStats.findMany({ where: { matchId } });
    return rows.map((r) => ({
      userId: r.userId,
      points: r.points,
      fieldGoalsMade: r.twoPointers + r.threePointers, // FGM is a total on the sheet
      fieldGoalAttempts: r.fieldGoalAttempts,
      threePointers: r.threePointers,
      threePointAttempts: r.threePointAttempts,
      freeThrows: r.freeThrows,
      freeThrowAttempts: r.freeThrowAttempts,
      rebounds: r.rebounds,
      offRebounds: r.offRebounds,
      defRebounds: r.defRebounds,
      assists: r.assists,
      steals: r.steals,
      blocks: r.blocks,
      turnovers: r.turnovers,
      personalFouls: r.personalFouls,
      minutesPlayed: r.minutesPlayed,
    }));
  }
  if (sport === 'FOOTBALL') {
    const rows = await prisma.footballStats.findMany({ where: { matchId } });
    return rows.map((r) => ({
      userId: r.userId,
      goals: r.goals, assists: r.assists, shots: r.shots, passes: r.passes,
      tackles: r.tackles, saves: r.saves, yellowCards: r.yellowCards,
      redCards: r.redCards, minutesPlayed: r.minutesPlayed,
    }));
  }
  const rows = await prisma.cricketStats.findMany({ where: { matchId } });
  return rows.map((r) => ({
    userId: r.userId,
    runs: r.runs, ballsFaced: r.ballsFaced, fours: r.fours, sixes: r.sixes,
    wickets: r.wickets, oversBowled: r.oversBowled, runsConceded: r.runsConceded,
    catches: r.catches, runOuts: r.runOuts,
  }));
}

/**
 * Tell the players their result is live. Fire-and-forget from the route — a
 * notification hiccup must never fail a publish that already wrote its stats.
 */
export async function notifyBoxScorePublished(args: {
  tournamentId: string; sport: Sport;
  homeTeamId: string; awayTeamId: string;
  homeScore: number; awayScore: number;
  matchId: string; playerStats: PlayerStatEntry[];
}): Promise<void> {
  const teams = await prisma.team.findMany({
    where: { id: { in: [args.homeTeamId, args.awayTeamId] } },
    select: { id: true, name: true },
  });
  const nameOf = (id: string) => teams.find((t) => t.id === id)?.name ?? 'Team';
  const stats = args.playerStats as { userId: string; stats?: Record<string, number> }[];

  await fanoutMatchResult({
    tournamentId: args.tournamentId, sport: args.sport,
    homeName: nameOf(args.homeTeamId), awayName: nameOf(args.awayTeamId),
    homeScore: args.homeScore, awayScore: args.awayScore,
    playerStats: stats,
  });
  await fanoutStatsVerified({
    tournamentId: args.tournamentId, sport: args.sport,
    matchId: args.matchId, playerIds: stats.map((p) => p.userId),
  });
}
