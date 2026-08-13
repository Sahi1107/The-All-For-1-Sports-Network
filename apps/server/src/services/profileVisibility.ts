// ─────────────────────────────────────────────────────────────────────────────
// Who is visible to someone other than themselves.
//
// ONE rule, expressed twice: as a Prisma WHERE fragment (for list queries like
// the ranking boards) and as a predicate (for the per-profile 404 gates). They
// are defined together here because when they disagree the failure is invisible
// and nasty — a player ranked #3 on a public board whose profile 404s when you
// tap them, or the reverse, a profile reachable by URL that the boards claim not
// to exist.
//
// The rule:
//
//   discoverable                        → visible (ordinary account)
//   UNCLAIMED and not guardian-managed  → visible (organiser-created profile)
//   anything else                       → not visible
//
// The second clause is the carve-out for players an organiser rostered without an
// email. Those rows are deliberately `discoverable: false`: the person never
// signed up and never consented, so they must stay out of people-search, Radar
// and Scout Copilot. But they played real matches and earned real stats, so their
// ranking entry and their profile page must both work — otherwise the tournament's
// own standings would be a lie by omission.
//
// `guardianManaged` gates the SECOND clause only. An under-13 shell is never
// public on the strength of being unclaimed — nobody has consented for it. But a
// guardian who has explicitly switched their minor's profile to discoverable (see
// PATCH /users/:id/discoverable) has consented, and that stays working: it is
// covered by the first clause, exactly as before this carve-out existed.
// ─────────────────────────────────────────────────────────────────────────────

/** The visibility fields any caller must select to evaluate the rule. */
export interface VisibilityFields {
  discoverable: boolean;
  claimStatus: string | null;
  guardianManaged: boolean;
}

/**
 * Prisma `user` WHERE fragment for list queries. Returns an OR, so compose it
 * under an explicit `AND` if the caller contributes an OR of its own (gender,
 * for instance) — two `OR` keys in one object silently overwrite each other.
 */
export function publicProfileWhere(): Record<string, unknown> {
  return {
    OR: [
      { discoverable: true },
      { claimStatus: 'UNCLAIMED', guardianManaged: false },
    ],
  };
}

/**
 * Predicate form, for the "is this profile viewable by someone else?" 404 gates.
 * Callers pass `isSelf` separately — you can always see your own profile.
 */
export function isPubliclyViewable(user: VisibilityFields): boolean {
  if (user.discoverable) return true; // incl. a minor a guardian opted in
  return user.claimStatus === 'UNCLAIMED' && !user.guardianManaged;
}
