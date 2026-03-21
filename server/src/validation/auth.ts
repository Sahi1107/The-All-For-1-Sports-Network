import { z } from 'zod';
import { reqStr, optStr, SportEnum, RoleEnum } from './common';

// ─── Password rules ───────────────────────────────────────────────────────────
// Min 8 chars, at least one uppercase, one lowercase, one digit.
// Max 128 chars — bcrypt silently truncates at 72 bytes so we reject longer
// passwords server-side rather than let users believe a 200-char password is set.
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

const password = z
  .string({ error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password cannot exceed 128 characters')
  .regex(
    PASSWORD_REGEX,
    'Password must include an uppercase letter, a lowercase letter, and a number',
  );

const email = z
  .string({ error: 'Email is required' })
  .email('Invalid email address')
  .max(254, 'Email address too long')            // RFC 5321 maximum
  .transform((s) => s.toLowerCase().trim());

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const RegisterBody = z.object({
  email,
  password,
  name:  reqStr(50, 'Name'),
  role:  RoleEnum,
  sport: SportEnum,
});

export const LoginBody = z.object({
  email,
  // Don't apply the strength regex on login — just check presence and max length.
  // Wrong-password error is returned either way; we don't want to leak which rule failed.
  password: z
    .string({ error: 'Password is required' })
    .min(1, 'Password is required')
    .max(128, 'Password cannot exceed 128 characters'),
});

export const RefreshBody = z.object({
  refreshToken: z.string({ error: 'Refresh token required' }).min(1),
});

export const ForgotPasswordBody = z.object({
  // Optional — route always returns 200 to prevent email enumeration
  email: email.optional().or(z.literal('')).transform((v) => (v === '' ? undefined : v)),
});

export const ResendVerificationBody = z.object({
  email: email.optional().or(z.literal('')).transform((v) => (v === '' ? undefined : v)),
});

export const ResetPasswordBody = z.object({
  token:    z.string({ error: 'Reset token is required' }).min(1).max(512),
  password,
});

export const LogoutBody = z.object({
  // refreshToken is optional — route still revokes the access token
  refreshToken: z.string().min(1).max(512).optional(),
});
