import { z } from 'zod';
import { uuidParam } from './common';

export const SportTrackerEnum = z.enum(['BASKETBALL', 'FOOTBALL']);

export const TrackerFormatEnum = z.enum(['LEAGUE', 'KNOCKOUT', 'MIXED']);

export const TrackerConfig = z
  .object({
    groupsCount: z.coerce.number().int().min(1).max(16).optional(),
    advancePerGroup: z.coerce.number().int().min(1).max(8).optional(),
    thirdPlace: z.boolean().optional(),
    halfLengthSeconds: z.coerce.number().int().min(60).max(7200).optional(),
    quarterSeconds: z.coerce.number().int().min(60).max(3600).optional(),
  })
  .optional();

export const CreateSessionBody = z.object({
  tournamentId: z.string().uuid('tournamentId must be a valid UUID'),
  format: TrackerFormatEnum,
  config: TrackerConfig,
});

export const TrackerMatchStatusEnum = z.enum([
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'PUBLISHED',
]);

// `state` is the tracker's authoritative live-match JSON. It is admin-authored
// and consumed only by the tracker UI + publish derivation, so we accept it as
// an opaque object rather than validating its full shape.
export const PatchMatchBody = z.object({
  state: z.record(z.string(), z.unknown()).optional(),
  homeScore: z.coerce.number().int().min(0).max(9999).optional(),
  awayScore: z.coerce.number().int().min(0).max(9999).optional(),
  status: TrackerMatchStatusEnum.optional(),
  // Admin team reassignment (correct a wrong/null-opponent match). Nullable to
  // allow clearing a side.
  homeTeamId: z.string().uuid().nullable().optional(),
  awayTeamId: z.string().uuid().nullable().optional(),
  // Scheduling: when + where the fixture is played. Nullable to clear (→ TBC).
  scheduledAt: z.coerce.date().nullable().optional(),
  court: z.string().trim().max(80).nullable().optional(),
});

// Bulk / sequential auto-scheduling across one or more courts.
export const ScheduleBody = z.object({
  startAt: z.coerce.date(),
  matchMinutes: z.coerce.number().int().min(1).max(600),
  gapMinutes: z.coerce.number().int().min(0).max(600),
  courts: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
  onlyUnscheduled: z.boolean().optional(),
});

// Save group structure (rename / move / add / remove teams among registered teams).
export const GroupsBody = z.object({
  groups: z.array(z.object({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(60),
    teamIds: z.array(z.string().uuid()),
  })).min(1).max(16),
});

// Withdraw a team from the tournament (clean removal pre-start, else walkovers).
export const WithdrawBody = z.object({ teamId: z.string().uuid() });

// Jersey numbers for the session roster, set pre-match by the scorer. 0–99 is
// every numbering convention in play (FIBA restricts to 0–99; 00 is stored as
// 0). null clears a number back to unset rather than forcing a placeholder.
export const JerseysBody = z.object({
  numbers: z
    .array(
      z.object({
        userId: z.string().uuid(),
        number: z.coerce.number().int().min(0).max(99).nullable(),
      }),
    )
    .max(1000),
});

export const IdParam = z.object({ id: uuidParam });
export const TournamentIdParam = z.object({ tournamentId: uuidParam });
