import type { Prisma } from '@prisma/client';

// Roles that can appear on a team roster. Excludes ADMIN / TEAM / SCOUT / AGENT —
// they are never rostered, so leaving them out both matches reality and narrows
// what this search can surface.
const ROSTERABLE_ROLES = ['ATHLETE', 'COACH'] as const;

/**
 * WHERE for the organiser/admin roster "add existing player" search.
 *
 * An organiser building their own tournament's rosters must be able to find ANY
 * rosterable person on the platform by name — self-registered or provisioned,
 * signed in or not, discoverable or not, including guardian-managed minors.
 * Safeguarding gates PUBLIC discovery (the /users search applies
 * `discoverable && !guardianManaged`); it does not apply here, where a vetted
 * organiser is assembling a roster, not browsing. So this deliberately does NOT
 * filter on `discoverable`, `guardianManaged`, or `mustResetPassword` — the
 * previous versions restricted to "already in this tournament OR unclaimed
 * provisioned shell", which hid every self-registered player who wasn't already
 * a participant. That was the bug.
 *
 * Anti-enumeration is enforced by the ROUTE, not by narrowing the result set:
 *   • requireTournamentAccess — only THIS tournament's organiser, or a platform
 *     admin, can call it. Not public, not any authenticated user.
 *   • a name substring is required (≥ 2 chars) — you can't list everyone.
 *   • results are capped (12) and unpaginated — you can't page the platform.
 *   • only id / name / position / avatar are returned — never email, phone,
 *     date of birth or location.
 *   • a rate limiter blunts prefix-scraping.
 * Role is restricted to rosterable people so the search can't enumerate staff,
 * scouts or agents.
 */
export function rosterPlayerSearchWhere(query: string): Prisma.UserWhereInput {
  return {
    name: { contains: query, mode: 'insensitive' },
    role: { in: [...ROSTERABLE_ROLES] },
  };
}
