import { z } from 'zod';
import { reqStr } from './common';

// Typeahead query. `q` is required, sanitized (HTML/control chars stripped) and
// trimmed by reqStr. 1–100 chars; the route treats <2 chars as "too short" and
// returns empty groups rather than an error, so the client stays simple.
export const SearchQuery = z.object({
  q: reqStr(100, 'Search query', 1),
});
