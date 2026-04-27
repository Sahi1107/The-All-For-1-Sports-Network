import { z } from 'zod';

// ─── Core sanitizer ───────────────────────────────────────────────────────────
//
// Applied to every string field before it reaches the database.
//   • Strips HTML tags  → prevents stored-XSS / reflected-XSS
//   • Strips null bytes and non-printable control characters
//     (keeps \n \r \t which are needed for multi-line text fields)
//     → prevents null-byte injection and some log-forging attacks
//   • Does NOT trim — callers do that explicitly so the transform chain
//     is easy to reason about

function stripDangerous(s: string): string {
  return s
    .replace(/<[^>]*>/g, '')                           // strip HTML tags
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // strip control chars
    .replace(/javascript\s*:/gi, '')                   // strip JS-URI schemes
    .replace(/data\s*:/gi, '');                        // strip data-URI schemes
}

// ─── Primitive builders ───────────────────────────────────────────────────────

/**
 * Required single-line string.  Sanitized, trimmed, length-bounded.
 * After trimming, the string must still have at least `min` characters.
 */
export function reqStr(max: number, label = 'Field', min = 1) {
  return z.preprocess(
    (v) => (typeof v === 'string' ? stripDangerous(v).trim() : v),
    z.string({ error: `${label} must be a string` })
    .min(min, `${label} must be at least ${min} character(s)`)
    .max(max, `${label} cannot exceed ${max} characters`),
  );
}

/**
 * Optional single-line string.  Undefined / null / empty-after-trim → omitted.
 */
export function optStr(max: number, label = 'Field') {
  return z.preprocess(
    (v) => {
      if (v === undefined || v === null) return undefined;
      if (typeof v === 'string') {
        const clean = stripDangerous(v).trim();
        return clean === '' ? undefined : clean;
      }
      return v;
    },
    z.string({ error: `${label} must be a string` })
      .max(max, `${label} cannot exceed ${max} characters`)
      .optional(),
  );
}

/**
 * Optional multi-line text (allows \n / \r but still strips HTML + control chars).
 */
export function optText(max: number, label = 'Field') {
  return z.preprocess(
    (v) => {
      if (v === undefined || v === null) return undefined;
      if (typeof v === 'string') {
        const clean = stripDangerous(v);   // keeps \n / \r
        return clean.trim() === '' ? undefined : clean;
      }
      return v;
    },
    z.string({ error: `${label} must be a string` })
      .max(max, `${label} cannot exceed ${max} characters`)
      .optional(),
  );
}

/**
 * Required multi-line text.
 */
export function reqText(max: number, label = 'Field', min = 1) {
  return z.preprocess(
    (v) => (typeof v === 'string' ? stripDangerous(v) : v),
    z.string({ error: `${label} must be a string` })
    .min(min, `${label} must be at least ${min} character(s)`)
    .max(max, `${label} cannot exceed ${max} characters`),
  );
}

// ─── UUID helpers ─────────────────────────────────────────────────────────────

/** Route param that must be a valid UUID. */
export const uuidParam = z.string().uuid('Invalid ID format');

/** Optional UUID field in a request body (e.g. optional foreign keys). */
export const optUuid = z.string().uuid('Must be a valid ID').optional();

// ─── Shared enums ─────────────────────────────────────────────────────────────

export const SportEnum = z.enum(
  [
    'BASKETBALL',
    'FOOTBALL',
    'CRICKET',
    'FIELD_HOCKEY',
    'BADMINTON',
    'ATHLETICS',
    'WRESTLING',
    'BOXING',
    'SHOOTING',
    'WEIGHTLIFTING',
    'ARCHERY',
    'TENNIS',
  ],
  { error: 'sport must be a supported Sport value' },
);

export const ATHLETICS_EVENTS = [
  '100m',
  '200m',
  '400m',
  '800m',
  '1500m',
  '3000m Steeplechase',
  '5000m',
  '10000m',
  '100m Hurdles',
  '110m Hurdles',
  '400m Hurdles',
  '4x100m Relay',
  '4x400m Relay',
  'High Jump',
  'Pole Vault',
  'Long Jump',
  'Triple Jump',
  'Shot Put',
  'Discus Throw',
  'Hammer Throw',
  'Javelin Throw',
] as const;

export const AthleticsEventEnum = z.enum(ATHLETICS_EVENTS);

export const RoleEnum = z.enum(['ATHLETE', 'COACH', 'SCOUT', 'TEAM', 'AGENT'], {
  error: 'role must be ATHLETE, COACH, SCOUT, TEAM, or AGENT',
});

// ─── Pagination query ─────────────────────────────────────────────────────────

/**
 * Parse and validate ?page and ?limit from req.query.
 * The paginationGuard middleware already enforces upper bounds (200 / 100)
 * but this schema also coerces to integers and enforces minimums.
 */
export const PaginationQuery = z.object({
  page:  z.coerce.number().int().min(1).max(200).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).partial();

// ─── Prototype-pollution guard ────────────────────────────────────────────────

/** Keys that could be used for prototype-pollution attacks. */
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function hasDangerousKeys(obj: unknown): boolean {
  if (typeof obj !== 'object' || obj === null) return false;
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (DANGEROUS_KEYS.has(key)) return true;
  }
  return false;
}
