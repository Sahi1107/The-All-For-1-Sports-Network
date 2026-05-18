import { optStr, PaginationQuery, SportEnum } from './common';

// Standalone team creation has been removed — teams are now created inline at
// tournament registration via POST /api/tournaments/:id/register.

export const TeamSearchQuery = PaginationQuery.extend({
  sport:  SportEnum.optional(),
  search: optStr(100, 'Search'),
});
