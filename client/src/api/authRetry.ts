// The recoverable-vs-terminal 401 decision, kept pure so it unit-tests and so the
// rule is readable in one place. A transient 401 — an expired or clock-skewed token
// mid-request — is recoverable by refreshing the token and retrying ONCE. A revoked
// session, or a 401 that persists after that retry, is terminal → send to /login.
// This is what stops a scorer being dumped to the login screen mid-match.

/** Retry the request once with a force-refreshed token? One retry only, never a loop. */
export function shouldRetryWithFreshToken(
  status: number | undefined,
  code: string | undefined,
  url: string | undefined,
  alreadyRetried: boolean,
): boolean {
  if (alreadyRetried) return false;                 // hard cap: at most one retry
  if (status !== 401) return false;                 // only auth failures are retryable here
  if (code === 'SESSION_REVOKED') return false;     // genuinely invalidated — don't paper over it
  if (code === 'ACCOUNT_NOT_FOUND') return false;   // no DB row — a fresh token can't create one
  if (url?.includes('/auth/sync')) return false;    // pre-login bootstrap endpoint
  return true;
}

/** After a retry is spent (or a 401 wasn't retryable), send the user to /login?
 *  Only for a real, unrecoverable 401 — never for other statuses (e.g. a 403 from a
 *  revoked tournament role must NOT dump the user; the caller handles it in place). */
export function shouldRedirectToLogin(status: number | undefined, url: string | undefined): boolean {
  if (status !== 401) return false;
  if (url?.includes('/auth/sync')) return false;
  return true;
}
