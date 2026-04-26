import { z } from 'zod';
import { reqStr, PaginationQuery, SportEnum } from './common';

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

export const CreateAdminBody = z.object({
  email: z
    .string({ error: 'Email is required' })
    .email('Invalid email address')
    .max(254, 'Email address too long')
    .transform((s) => s.toLowerCase().trim()),
  name: reqStr(50, 'Name'),
  password: z
    .string({ error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password cannot exceed 128 characters')
    .regex(PASSWORD_REGEX, 'Password must include an uppercase letter, a lowercase letter, and a number'),
});

export const AdminUserListQuery = PaginationQuery.extend({
  role:   z.enum(['ATHLETE', 'COACH', 'SCOUT', 'TEAM', 'AGENT', 'ADMIN']).optional(),
  sport:  SportEnum.optional(),
  search: z.string().max(100).optional().transform((v) => (v ? v.trim() : undefined)),
});

export const AdminUpdateRoleBody = z.object({
  role: z.enum(['ATHLETE', 'COACH', 'SCOUT', 'TEAM', 'AGENT', 'ADMIN'], {
    error: 'role must be ATHLETE, COACH, SCOUT, TEAM, AGENT, or ADMIN',
  }),
});

export const AdminVerifyBody = z.object({
  verified: z.boolean({ error: 'verified (boolean) is required' }),
});
