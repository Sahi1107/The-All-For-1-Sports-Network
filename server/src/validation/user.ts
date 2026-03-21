import { z } from 'zod';
import { optStr, optText, PaginationQuery, SportEnum, RoleEnum } from './common';

// ─── Profile update ───────────────────────────────────────────────────────────

export const UpdateProfileBody = z.object({
  name:         optStr(50,   'Name'),
  bio:          optText(500, 'Bio'),
  location:     optStr(100,  'Location'),
  height:       optStr(20,   'Height'),
  position:     optStr(50,   'Position'),
  achievements: optText(1000, 'Achievements'),
  // age: integer 1–100, coerced from string (HTML forms send strings)
  age: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
    z.number().int().min(1).max(100).optional(),
  ),
});

// ─── User search query ────────────────────────────────────────────────────────

export const UserSearchQuery = PaginationQuery.extend({
  role:     RoleEnum.optional(),
  sport:    SportEnum.optional(),
  search:   optStr(100, 'Search'),
  location: optStr(100, 'Location'),
});
