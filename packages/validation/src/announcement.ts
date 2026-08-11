import { z } from 'zod';
import { reqStr, reqText, PaginationQuery, SportEnum } from './common';

export const CreateAnnouncementBody = z.object({
  title:   reqStr(100,  'Title'),
  content: reqText(2000, 'Content'),
  type: z.enum(['TRIAL', 'TRAINING', 'GENERAL'], {
    error: 'type must be TRIAL, TRAINING, or GENERAL',
  }).optional(),
  sport: SportEnum.optional(),
});

export const AnnouncementListQuery = PaginationQuery.extend({
  sport: SportEnum.optional(),
  type: z.enum(['TRIAL', 'TRAINING', 'GENERAL']).optional(),
});
