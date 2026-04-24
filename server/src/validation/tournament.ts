import { z } from 'zod';
import { reqStr, optStr, PaginationQuery, SportEnum } from './common';

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
}).refine(
  (d) => d.endDate >= d.startDate,
  { message: 'End date must be on or after start date', path: ['endDate'] },
);

export const UpdateTournamentBody = z.object({
  name:        optStr(100,  'Tournament name'),
  status:      z.enum(
    ['UPCOMING', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
    { error: 'Invalid tournament status' },
  ).optional(),
  description: optStr(1000, 'Description'),
  venue:       optStr(100,  'Venue'),
  city:        optStr(100,  'City'),
  prizePool:   nonNegNum('Prize pool'),
  maxTeams:    positiveInt('Max teams'),
});

export const TournamentListQuery = PaginationQuery.extend({
  sport:  SportEnum.optional(),
  status: z.enum(
    ['UPCOMING', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  ).optional(),
});

// ─── Match management ─────────────────────────────────────────────────────────

export const RegisterTeamBody = z.object({
  teamId: z.string().uuid('teamId must be a valid UUID'),
});

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
