// ─────────────────────────────────────────────────────────────────────────────
// The privacy gate for search suggestions. ONE definition, used by the search
// endpoint's Prisma WHERE *and* re-applied as a defensive post-filter on the
// fetched rows — belt-and-suspenders, mirroring the public-SSR gate. A profile
// a minor/guardian-managed/private user owns must NEVER appear in another user's
// typeahead, and blocked users must never surface to each other.
//
// A person is searchable ONLY IF
//   discoverable === true
//   AND guardianManaged === false      ← explicit; never trust `discoverable` alone
//   AND role is not ADMIN or TEAM       ← admins are hidden; teams are their own group
//   AND they are not the viewer
//   AND they are not in a block relationship with the viewer (either direction)
// ─────────────────────────────────────────────────────────────────────────────

/** Roles never shown in People suggestions. ADMIN is hidden; TEAM is an org
 *  account surfaced under the Teams group, not People. */
export const NON_PERSON_ROLES = ['ADMIN', 'TEAM'] as const;

/** Minimal fields the gate inspects on a fetched row (defensive re-check). */
export interface PersonGateFields {
  id: string;
  role: string;
  discoverable: boolean;
  guardianManaged: boolean;
}

/**
 * Prisma WHERE fragment encoding the full people gate. Combined with the text
 * match by the caller. `excludeIds` is [viewerId, ...bidirectionally-blocked].
 * Structurally assignable to Prisma.UserWhereInput.
 */
export function searchablePeopleWhere(excludeIds: string[]) {
  return {
    discoverable: true,
    guardianManaged: false,
    role: { notIn: [...NON_PERSON_ROLES] },
    id: { notIn: excludeIds },
  };
}

/**
 * Independent re-check of a fetched row — MUST mirror searchablePeopleWhere.
 * Runs after the query so that even a wrong/edited query can never leak an
 * ineligible profile. Any deviation → excluded (fail closed).
 *
 * `excluded` is the Set of ids to hide (viewer + blocked, both directions).
 */
export function isSearchablePerson(u: PersonGateFields, excluded: ReadonlySet<string>): boolean {
  if (!u || typeof u.id !== 'string') return false;
  if (u.discoverable !== true) return false;          // private / under-13-by-default
  if (u.guardianManaged !== false) return false;      // guardian-managed (minor) — never
  if ((NON_PERSON_ROLES as readonly string[]).includes(u.role)) return false; // ADMIN / TEAM
  if (excluded.has(u.id)) return false;               // self or blocked (either direction)
  return true;
}
