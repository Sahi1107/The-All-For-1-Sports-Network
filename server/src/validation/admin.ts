import { z } from 'zod';
import { reqStr, PaginationQuery, SportEnum, GenderEnum } from './common';

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
  role:   z.enum(['ATHLETE', 'COACH', 'SCOUT', 'TEAM', 'AGENT', 'MEDIA', 'ADMIN']).optional(),
  sport:  SportEnum.optional(),
  search: z.string().max(100).optional().transform((v) => (v ? v.trim() : undefined)),
});

export const AdminUpdateRoleBody = z.object({
  role: z.enum(['ATHLETE', 'COACH', 'SCOUT', 'TEAM', 'AGENT', 'MEDIA', 'ADMIN'], {
    error: 'role must be ATHLETE, COACH, SCOUT, TEAM, AGENT, MEDIA, or ADMIN',
  }),
});

export const AdminVerifyBody = z.object({
  verified: z.boolean({ error: 'verified (boolean) is required' }),
});

// ─── Moderation queue ─────────────────────────────────────────────────────────

export const AdminReportListQuery = PaginationQuery.extend({
  status:     z.enum(['OPEN', 'REVIEWED', 'DISMISSED', 'ACTIONED']).optional(),
  targetType: z.enum(['USER', 'POST', 'COMMENT', 'MESSAGE']).optional(),
});

export const AdminReportStatusBody = z.object({
  status: z.enum(['OPEN', 'REVIEWED', 'DISMISSED', 'ACTIONED'], {
    error: 'status must be OPEN, REVIEWED, DISMISSED, or ACTIONED',
  }),
});

// ─── Single athlete/coach profile creation (admin form) ───────────────────────
// DOB + under-13 guardian rules are enforced in provisionAthleteAccount, which
// this endpoint delegates to — the schema only validates shape.

export const AdminCreateAthleteBody = z.object({
  name:  reqStr(80, 'Name'),
  email: z
    .string({ error: 'Email is required' })
    .email('Invalid email address')
    .max(254, 'Email address too long')
    .transform((s) => s.toLowerCase().trim()),
  role:  z.enum(['ATHLETE', 'COACH']).default('ATHLETE'),
  sport: SportEnum,
  // ISO date string; age is derived server-side. Required for athletes is
  // enforced downstream so the error message is consistent everywhere.
  dateOfBirth:   z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date of birth').optional(),
  gender:        GenderEnum.optional(),
  position:      z.string().max(60).optional(),
  phone:         z.string().max(40).optional(),
  guardianEmail: z
    .string()
    .email('Invalid guardian email address')
    .max(254)
    .optional()
    .transform((s) => (s ? s.toLowerCase().trim() : s)),
});

// ─── Bulk provisioning (tournament roster import) ─────────────────────────────
//
// The client parses the CSV and POSTs an array of normalized "long-format" rows
// (one record per member). Wide Google-Form rows are unpivoted client-side into
// this shape first. The schema only validates the *envelope* — that each row is
// an object of short strings. Authoritative per-row validation (DOB parsing,
// email/role mapping, roster sizing, NEW/EXISTING classification) happens in the
// bulkProvision service so we can return a structured per-row report instead of
// a blunt 400. Never trust the client's own classification.

const BulkProvisionRow = z
  .object({
    team_name:      z.string().max(120).optional(),
    member_role:    z.string().max(20).optional(),
    name:           z.string().max(120).optional(),
    email:          z.string().max(254).optional(),
    dob:            z.string().max(40).optional(),
    gender:         z.string().max(20).optional(),
    position:       z.string().max(60).optional(),
    phone:          z.string().max(40).optional(),
    guardian_email: z.string().max(254).optional(),
  })
  // Tolerate extra columns the form may carry; the service ignores them.
  .passthrough();

export const BulkProvisionBody = z.object({
  rows: z
    .array(BulkProvisionRow, { error: 'rows must be an array of CSV records' })
    .min(1, 'At least one row is required')
    .max(2000, 'Too many rows in a single import (max 2000)'),
});

export const BulkProvisionParams = z.object({
  tournamentId: z.string().uuid('Invalid tournament ID'),
});
