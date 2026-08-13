// ─────────────────────────────────────────────────────────────────────────────
// ONE role-aware definition of "profile complete", so the "Complete your profile"
// nag and the verified-badge check can never disagree, and no role is ever asked
// for fields that don't apply to it.
//
// The old check demanded athlete fields (position, age, gender) of EVERY non-staff
// role — so a fully-onboarded coach/scout/agent/media had no `position` and was
// nagged forever. Requirements are now scoped to the role.
// ─────────────────────────────────────────────────────────────────────────────

export interface CompletenessUser {
  role: string;
  name?: string | null;
  sport?: string | null;
  gender?: string | null;
  bio?: string | null;
  avatar?: string | null;
  location?: string | null;
  age?: number | null;
  position?: string | null;
}

/** Fields every individual profile needs, regardless of role. */
const CORE_FIELDS = ['name', 'bio', 'avatar', 'location'] as const;
/** Extra fields only a ranked player (ATHLETE) needs. `position` is deliberately
 *  NOT here: an admin/organiser can set a player's position at any time (see the
 *  roster editor), so a missing position is not the athlete's own incompleteness
 *  to be nagged about — and it must not gate their verified badge or their
 *  appearance in the rankings. */
const ATHLETE_EXTRA = ['sport', 'gender', 'age'] as const;

/** Staff accounts have no public profile to complete. */
const STAFF_ROLES = new Set(['ADMIN', 'ORGANIZER']);

function isFilled(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'number') return true; // 0 is a valid age only in theory; treat presence as filled
  return true;
}

/**
 * Which fields are still missing for THIS user's role, and whether the profile is
 * complete. Pure — safe to unit-test and to run on both server and client.
 *   • ADMIN / ORGANIZER  → always complete (no public profile).
 *   • ATHLETE            → core + sport, gender, age, position (ranked player).
 *   • COACH/SCOUT/AGENT/MEDIA/TEAM → core only (never asked for player fields).
 */
export function profileCompleteness(u: CompletenessUser): { complete: boolean; missing: string[] } {
  if (STAFF_ROLES.has(u.role)) return { complete: true, missing: [] };

  const required: string[] = [...CORE_FIELDS];
  if (u.role === 'ATHLETE') required.push(...ATHLETE_EXTRA);

  const rec = u as unknown as Record<string, unknown>;
  const missing = required.filter((f) => !isFilled(rec[f]));
  return { complete: missing.length === 0, missing };
}

export function isProfileComplete(u: CompletenessUser): boolean {
  return profileCompleteness(u).complete;
}
