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

// ─── Live basketball event log ───────────────────────────────
// The tracker's write path. Unlike `state` above these are validated in full:
// they're the source of truth a published box score is folded from, so a
// malformed event is a wrong result rather than a cosmetic glitch.

export const TrackerEventKindEnum = z.enum([
  // shots
  'FG2_MADE', 'FG2_MISS', 'FG3_MADE', 'FG3_MISS', 'FT_MADE', 'FT_MISS',
  // other stats
  'AST', 'OREB', 'DREB', 'STL', 'BLK', 'TO', 'PF',
  // game control
  'CLOCK_START', 'CLOCK_STOP', 'CLOCK_SET', 'QUARTER_SET',
  'SUB', 'LINEUP_SET', 'PERIOD_BASKETS_SWAP',
]);

export const BasketEnum = z.enum(['LEFT', 'RIGHT']);

const ControlPayload = z.object({
  clockMs: z.coerce.number().int().min(0).max(3_600_000).optional(),
  quarter: z.coerce.number().int().min(1).max(12).optional(),
  outIds: z.array(z.string().uuid()).max(15).optional(),
  inIds: z.array(z.string().uuid()).max(15).optional(),
  side: z.enum(['home', 'away']).optional(),
  lineup: z.array(z.string().uuid()).max(15).optional(),
  homeAttacks: BasketEnum.optional(),
}).strict();

const FIELD_GOAL_KINDS = new Set(['FG2_MADE', 'FG2_MISS', 'FG3_MADE', 'FG3_MISS']);

export const TrackerEventBody = z.object({
  kind: TrackerEventKindEnum,
  playerId: z.string().uuid().nullable().optional(),
  teamId: z.string().uuid().nullable().optional(),
  // Normalised court position (0..1 on each axis) as rendered.
  x: z.coerce.number().min(0).max(1).nullable().optional(),
  y: z.coerce.number().min(0).max(1).nullable().optional(),
  basket: BasketEnum.nullable().optional(),
  quarter: z.coerce.number().int().min(1).max(12),
  clockMs: z.coerce.number().int().min(0).max(3_600_000),
  payload: ControlPayload.nullable().optional(),
  // Idempotency key: a retried append after a flaky connection must not record
  // the same basket twice, so the server treats a repeat as the same event.
  clientId: z.string().min(8).max(64),
})
  .superRefine((v, ctx) => {
    // A field goal without a location is a hole in the shot chart that nobody
    // can fill in afterwards — the analyst is the only one who saw it. Reject at
    // the boundary rather than storing an attempt that can never be plotted.
    if (FIELD_GOAL_KINDS.has(v.kind)) {
      if (v.x == null || v.y == null) {
        ctx.addIssue({ code: 'custom', path: ['x'], message: 'A field-goal attempt must carry its court position' });
      }
      if (!v.basket) {
        ctx.addIssue({ code: 'custom', path: ['basket'], message: 'A field-goal attempt must say which basket was attacked' });
      }
    }
    // Every stat event belongs to a player; control events never do.
    const isControl = v.kind.startsWith('CLOCK_') || v.kind === 'QUARTER_SET'
      || v.kind === 'SUB' || v.kind === 'LINEUP_SET' || v.kind === 'PERIOD_BASKETS_SWAP';
    if (!isControl && !v.playerId) {
      ctx.addIssue({ code: 'custom', path: ['playerId'], message: 'A stat event must name the player it belongs to' });
    }
    // The side is required, not inferred. The server credits a made basket to a
    // team's score the moment it lands, and guessing the side from who happens
    // to be on court would mis-score any stat entered for a player the lineup
    // hasn't caught up with yet.
    if (!isControl && !v.teamId) {
      ctx.addIssue({ code: 'custom', path: ['teamId'], message: 'A stat event must name the team it belongs to' });
    }
    // Paired substitution arrays — an unbalanced sub would drop a player off the
    // floor entirely and quietly stop crediting their minutes.
    if (v.kind === 'SUB') {
      const outs = v.payload?.outIds?.length ?? 0;
      const ins = v.payload?.inIds?.length ?? 0;
      if (outs === 0 || outs !== ins) {
        ctx.addIssue({ code: 'custom', path: ['payload'], message: 'A substitution needs the same number of players coming off and coming on' });
      }
    }
  });

/** Catch-up read: everything after a sequence the client already holds. */
export const TrackerEventQuery = z.object({
  since: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(5000).optional(),
});

export const TrackerEventIdParam = z.object({
  id: uuidParam,
  eventId: uuidParam,
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
