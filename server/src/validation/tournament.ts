import { z } from 'zod';
import { reqStr, optStr, PaginationQuery, SportEnum, GenderEnum } from './common';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** ISO-8601 date string coerced to a Date object. */
const isoDate = (label: string) =>
  z.string({ error: `${label} is required` })
   .datetime({ message: `${label} must be a valid ISO-8601 date` })
   .transform((s) => new Date(s));

/** Non-negative number coerced from string or number. */
const nonNegNum = (label: string) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
    z.number().min(0, `${label} must be non-negative`).optional(),
  );

const positiveInt = (label: string) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
    z.number().int().positive(`${label} must be a positive integer`).optional(),
  );

// ─── Tournament CRUD ──────────────────────────────────────────────────────────

const TournamentFormatEnum = z.enum(['TEAM', 'INDIVIDUAL', 'DOUBLES'], {
  error: 'format must be TEAM, INDIVIDUAL, or DOUBLES',
});

export const CreateTournamentBody = z.object({
  name:           reqStr(100, 'Tournament name'),
  sport:          SportEnum,
  category:       optStr(50,  'Category'),
  description:    optStr(1000, 'Description'),
  venue:          optStr(100, 'Venue'),
  city:           optStr(100, 'City'),
  startDate:      isoDate('Start date'),
  endDate:        isoDate('End date'),
  prizePool:      nonNegNum('Prize pool'),
  entryFee:       nonNegNum('Entry fee'),
  maxTeams:       positiveInt('Max teams'),
  ageCategory:    optStr(30, 'Age category'),
  genderCategory: optStr(20, 'Gender category'),
  format:         TournamentFormatEnum.optional().default('TEAM'),
  minRosterSize:  positiveInt('Minimum roster size'),
  maxRosterSize:  positiveInt('Maximum roster size'),
}).refine(
  (d) => d.endDate >= d.startDate,
  { message: 'End date must be on or after start date', path: ['endDate'] },
).refine(
  (d) => d.minRosterSize == null || d.maxRosterSize == null || d.minRosterSize <= d.maxRosterSize,
  { message: 'Minimum roster size must be ≤ maximum roster size', path: ['minRosterSize'] },
);

// Everything on the tournament record an organiser may edit for their own
// tournament. Sport and format are deliberately EXCLUDED: they set the stat
// schema and entry model, and changing them once teams/matches exist would
// corrupt data — they stay fixed at creation.
export const UpdateTournamentBody = z.object({
  name:          optStr(100,  'Tournament name'),
  status:        z.enum(
    ['UPCOMING', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
    { error: 'Invalid tournament status' },
  ).optional(),
  description:    optStr(1000, 'Description'),
  venue:          optStr(100,  'Venue'),
  city:           optStr(100,  'City'),
  startDate:      isoDate('Start date').optional(),
  endDate:        isoDate('End date').optional(),
  prizePool:      nonNegNum('Prize pool'),
  entryFee:       nonNegNum('Entry fee'),
  maxTeams:       positiveInt('Max teams'),
  category:       optStr(50, 'Category'),
  ageCategory:    optStr(30, 'Age category'),
  genderCategory: optStr(20, 'Gender category'),
  minRosterSize:  positiveInt('Minimum roster size'),
  maxRosterSize:  positiveInt('Maximum roster size'),
  // Knockout third-place playoff toggle. When a draw exists, flipping this
  // adds/removes the actual fixture; confirmThirdPlaceRemoval acknowledges that
  // disabling it will delete an already-played third-place result.
  thirdPlace:               z.boolean().optional(),
  confirmThirdPlaceRemoval: z.boolean().optional(),
}).refine(
  (d) => d.minRosterSize == null || d.maxRosterSize == null || d.minRosterSize <= d.maxRosterSize,
  { message: 'Minimum roster size must be ≤ maximum roster size', path: ['minRosterSize'] },
).refine(
  (d) => d.startDate == null || d.endDate == null || d.endDate >= d.startDate,
  { message: 'End date must be on or after start date', path: ['endDate'] },
);

export const TournamentListQuery = PaginationQuery.extend({
  sport:  SportEnum.optional(),
  status: z.enum(
    ['UPCOMING', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  ).optional(),
  search: optStr(100, 'Search'),
});

// ─── Tournament registration (inline team creation) ──────────────────────────

// Multipart sends arrays as JSON strings; JSON requests send native arrays.
// Pre-parse strings into arrays so the rest of the schema works for both.
const jsonStringArray = z.preprocess(
  (v) => {
    if (typeof v !== 'string') return v;
    try { return JSON.parse(v); } catch { return v; }
  },
  z.array(z.string().uuid('playerUserIds must contain valid UUIDs'))
    .min(1, 'At least one player is required')
    .max(50, 'Cannot register more than 50 players'),
);

export const RegisterTeamBody = z.object({
  teamName:      reqStr(50, 'Team name'),
  captainUserId: z.string().uuid('captainUserId must be a valid UUID'),
  coachUserId:   z.string().uuid('coachUserId must be a valid UUID').optional(),
  playerUserIds: jsonStringArray,
}).refine(
  (d) => d.playerUserIds.includes(d.captainUserId),
  { message: 'Captain must be one of the players', path: ['captainUserId'] },
).refine(
  (d) => new Set(d.playerUserIds).size === d.playerUserIds.length,
  { message: 'Player list contains duplicates', path: ['playerUserIds'] },
);

// ─── Provision a NEW player onto a team (tournament-scoped) ────────────────────
// Lets an organiser add a player who isn't on the platform yet: the profile is
// created and added to the team directly (all-accepted). The SPORT is taken from
// the tournament, never the body — so this can't create off-tournament accounts.
// Only ATHLETE/COACH — never a privileged role.
//
// EMAIL IS OPTIONAL. With one, an account is provisioned as before (credentials +
// welcome email, under-13 guardian consent — all enforced downstream by
// provisionAthleteAccount). Without one, an UNCLAIMED shell profile is created
// instead (services/unclaimedPlayer): it rosters, tracks and ranks like any other
// player but has no login until the player redeems a claim code. DOB + gender stay
// mandatory on both paths — gender drives the split ranking boards and DOB drives
// age categories and the under-13 safeguards.

export const ProvisionMemberBody = z.object({
  name:  reqStr(80, 'Name'),
  // Omitted / empty ⇒ create an unclaimed profile. `''` is normalised to
  // undefined so a cleared form field behaves the same as an absent one.
  email: z
    .string()
    .max(254, 'Email address too long')
    .optional()
    // Trim FIRST, then treat anything empty as absent — a whitespace-only field
    // must mean "no email", not an unparseable address.
    .transform((s) => { const t = s?.trim().toLowerCase(); return t ? t : undefined; })
    .refine((s) => s === undefined || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s), 'Invalid email address'),
  role:  z.enum(['ATHLETE', 'COACH'], { error: 'role must be ATHLETE or COACH' }).default('ATHLETE'),
  dateOfBirth: z
    .string({ error: 'Date of birth is required' })
    .refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date of birth'),
  gender:   GenderEnum, // required — rankings are split men's/women's
  position: optStr(60, 'Position'),
  phone:    optStr(40, 'Phone'),
  guardianEmail: z
    .string()
    .email('Invalid guardian email address')
    .max(254)
    .optional()
    .transform((s) => (s ? s.toLowerCase().trim() : s)),
  // Set by the client after the organiser confirms a duplicate warning.
  allowDuplicate: z.boolean().optional(),
});

// Organiser roster search — see services/rosterSearch. `q` is a name fragment.
export const PlayerSearchQuery = z.object({
  q: z.string().max(100).optional().transform((v) => (v ? v.trim() : '')),
});

// ─── Team invite responses ────────────────────────────────────────────────────

// (No body required — both endpoints derive the user from auth and the team from the URL.)

// ─── Match management ─────────────────────────────────────────────────────────

export const CreateMatchBody = z.object({
  homeTeamId: z.string().uuid('homeTeamId must be a valid UUID'),
  awayTeamId: z.string().uuid('awayTeamId must be a valid UUID'),
  round:     optStr(50, 'Round'),
  matchDate: isoDate('Match date'),
}).refine(
  (d) => d.homeTeamId !== d.awayTeamId,
  { message: 'Home team and away team must be different', path: ['awayTeamId'] },
);

// ─── Match result + per-sport player stats ────────────────────────────────────

const BasketballStatsShape = z.object({
  points:       z.coerce.number().min(0).max(200),
  rebounds:     z.coerce.number().min(0).max(100),
  assists:      z.coerce.number().min(0).max(100),
  steals:       z.coerce.number().min(0).max(50),
  blocks:       z.coerce.number().min(0).max(50),
  threePointers:z.coerce.number().min(0).max(50),
  freeThrows:   z.coerce.number().min(0).max(50),
  turnovers:    z.coerce.number().min(0).max(50),
  minutesPlayed:z.coerce.number().min(0).max(60),
}).partial();

const FootballStatsShape = z.object({
  goals:        z.coerce.number().min(0).max(50),
  assists:      z.coerce.number().min(0).max(50),
  shots:        z.coerce.number().min(0).max(100),
  passes:       z.coerce.number().min(0).max(300),
  tackles:      z.coerce.number().min(0).max(100),
  saves:        z.coerce.number().min(0).max(100),
  yellowCards:  z.coerce.number().min(0).max(2),
  redCards:     z.coerce.number().min(0).max(1),
  minutesPlayed:z.coerce.number().min(0).max(130),
}).partial();

const CricketStatsShape = z.object({
  runs:        z.coerce.number().min(0).max(400),
  ballsFaced:  z.coerce.number().min(0).max(600),
  fours:       z.coerce.number().min(0).max(100),
  sixes:       z.coerce.number().min(0).max(50),
  wickets:     z.coerce.number().min(0).max(10),
  oversBowled: z.coerce.number().min(0).max(50),
  runsConceded:z.coerce.number().min(0).max(400),
  catches:     z.coerce.number().min(0).max(10),
  runOuts:     z.coerce.number().min(0).max(10),
  strikeRate:  z.coerce.number().min(0).max(1000),
  economy:     z.coerce.number().min(0).max(100),
}).partial();

const PlayerStatEntry = z.object({
  userId: z.string().uuid('playerStats[].userId must be a valid UUID'),
  stats:  z.union([BasketballStatsShape, FootballStatsShape, CricketStatsShape]),
});

export const MatchResultBody = z.object({
  homeScore:   z.coerce.number().int().min(0).max(9999).optional(),
  awayScore:   z.coerce.number().int().min(0).max(9999).optional(),
  playerStats: z.array(PlayerStatEntry).max(50, 'Cannot submit stats for more than 50 players').optional(),
});

// ─── Manual box score (untracked match) ───────────────────────────────────────
//
// The organiser types a finished match's box score in afterwards. Shapes mirror
// how a box score is actually printed — notably FGM/FGA are TOTALS including
// threes (see the sample sheet), which services/manualBoxScore converts to the
// schema's separate two-/three-point columns.
//
// This schema only bounds the numbers. The rules that make a box score COHERENT
// (points matching the shooting line, makes ≤ attempts, threes ⊆ field goals) live
// in services/manualBoxScore so the client can run exactly the same checks as it
// types. Team scores are deliberately NOT accepted here — they're derived by
// summing the sheet, so the score and the box score can never disagree.

const BoxScoreBasketballShape = z.object({
  points:             z.coerce.number().int().min(0).max(200),
  fieldGoalsMade:     z.coerce.number().int().min(0).max(100), // FGM — total, incl. threes
  fieldGoalAttempts:  z.coerce.number().int().min(0).max(150), // FGA — total, incl. threes
  threePointers:      z.coerce.number().int().min(0).max(50),
  threePointAttempts: z.coerce.number().int().min(0).max(80),
  freeThrows:         z.coerce.number().int().min(0).max(60),
  freeThrowAttempts:  z.coerce.number().int().min(0).max(80),
  rebounds:           z.coerce.number().int().min(0).max(100),
  offRebounds:        z.coerce.number().int().min(0).max(60),
  defRebounds:        z.coerce.number().int().min(0).max(80),
  assists:            z.coerce.number().int().min(0).max(100),
  steals:             z.coerce.number().int().min(0).max(50),
  blocks:             z.coerce.number().int().min(0).max(50),
  turnovers:          z.coerce.number().int().min(0).max(50),
  personalFouls:      z.coerce.number().int().min(0).max(10),
  minutesPlayed:      z.coerce.number().min(0).max(80),
}).partial();

const BoxScoreFootballShape = FootballStatsShape;
const BoxScoreCricketShape = CricketStatsShape.omit({ strikeRate: true, economy: true });

const BoxScoreLine = z.object({
  userId: z.string().uuid('Each box score line needs a valid player'),
  /** false = DNP. A DNP writes NO stat row — see services/manualBoxScore. */
  played: z.boolean().default(true),
  stats: z.union([BoxScoreBasketballShape, BoxScoreFootballShape, BoxScoreCricketShape]).optional(),
});

export const BoxScoreBody = z.object({
  homeTeamId: z.string().uuid('Home team is required'),
  awayTeamId: z.string().uuid('Away team is required'),
  matchDate:  isoDate('Match date'),
  round:      optStr(50, 'Round'),
  court:      optStr(60, 'Court'),
  home: z.array(BoxScoreLine).max(30, 'A roster cannot exceed 30 players'),
  away: z.array(BoxScoreLine).max(30, 'A roster cannot exceed 30 players'),
}).refine((d) => d.homeTeamId !== d.awayTeamId, {
  message: 'A team cannot play itself', path: ['awayTeamId'],
});

/**
 * Box score entered against an EXISTING tracker fixture (the fixtures list).
 *
 * Just the two sheets. Teams, round, court and date all come from the fixture the
 * draw already created — accepting them here would let a box score silently
 * re-point a fixture at different teams or a different date, which is what the
 * fixture-management tools are for.
 */
export const FixtureBoxScoreBody = z.object({
  home: z.array(BoxScoreLine).max(30, 'A roster cannot exceed 30 players'),
  away: z.array(BoxScoreLine).max(30, 'A roster cannot exceed 30 players'),
});
