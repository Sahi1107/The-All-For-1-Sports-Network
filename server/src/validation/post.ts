import { z } from 'zod';
import { reqStr, optStr, optUuid, PaginationQuery, SportEnum } from './common';

// ─── Post ─────────────────────────────────────────────────────────────────────

export const CreatePostBody = z.object({
  type:    z.enum(['TEXT', 'IMAGE', 'HIGHLIGHT'], {
    error: 'type must be TEXT, IMAGE, or HIGHLIGHT',
  }),
  content: optStr(2000, 'Content'),
  title:   optStr(100,  'Title'),
  commentsDisabled: z.preprocess((v) => v === 'true' || v === true, z.boolean()).optional(),
});

// ─── Highlight ────────────────────────────────────────────────────────────────

export const CreateHighlightBody = z.object({
  title:              reqStr(100, 'Title'),
  description:        optStr(500, 'Description'),
  tournamentId:       optUuid,
  tournamentLocation: optStr(100, 'Tournament location'),
});

export const HighlightListQuery = PaginationQuery.extend({
  sport:        SportEnum.optional(),
  userId:       z.string().uuid().optional(),
  tournamentId: z.string().uuid().optional(),
});
