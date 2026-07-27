// ─────────────────────────────────────────────────────────────────────────────
// Session revocation ("sign out of all devices").
//
// When a user revokes sessions we (a) call Firebase revokeRefreshTokens so no
// NEW ID tokens can be minted for old sessions, and (b) stamp sessionsRevokedAt
// on our row. The auth middleware then rejects any presented ID token that was
// authenticated BEFORE that instant — making revocation take effect immediately
// rather than only when the current ID token expires (~1h).
//
// Pure + exported so the comparison is unit-tested without Firebase.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * True if a Firebase ID token — issued from a sign-in at `authTimeSeconds`
 * (the `auth_time` claim, seconds since epoch) — predates the account's session
 * revocation and must therefore be rejected.
 *
 * Fails OPEN (returns false) when there's no revocation on record or the
 * auth_time is unusable, so a malformed claim can never lock a user out; the
 * token still had to pass Firebase signature verification to get here.
 */
export function isSessionRevoked(authTimeSeconds: number | undefined | null, revokedAt: Date | null | undefined): boolean {
  if (!revokedAt) return false;
  if (typeof authTimeSeconds !== 'number' || !Number.isFinite(authTimeSeconds)) return false;
  // auth_time has 1-second granularity; a token minted in the same second as the
  // revocation is treated as revoked (use <=), so "sign out everywhere" can't be
  // beaten by a token issued in the same tick.
  return Math.floor(authTimeSeconds) * 1000 <= revokedAt.getTime();
}
