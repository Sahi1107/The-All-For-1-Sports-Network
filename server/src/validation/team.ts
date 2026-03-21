import { z } from 'zod';
import { reqStr, optStr, PaginationQuery, SportEnum } from './common';

export const CreateTeamBody = z.object({
  name:        reqStr(50,  'Team name'),
  sport:       SportEnum,
  description: optStr(500, 'Description'),
});

export const TeamSearchQuery = PaginationQuery.extend({
  sport:  SportEnum.optional(),
  search: optStr(100, 'Search'),
});
