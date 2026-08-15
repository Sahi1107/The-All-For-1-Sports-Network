// The mobile auth seam that @af1/api-client is wired to. It mirrors the web
// adapter's three responsibilities — hand out a token, force-refresh it, react
// to a dead session — but with a native implementation.
//
// SCAFFOLD STATE: there is no mobile sign-in yet, so this holds a token in memory
// (settable once auth is built) and no-ops the refresh. When Firebase Auth (or
// whichever provider) lands on mobile, replace the bodies below:
//   • getToken      → the SDK's cached-token getter
//   • refreshToken  → a forced refresh
//   • onSessionExpired → reset the navigation stack to the sign-in screen
// The token should live in expo-secure-store, NOT AsyncStorage. Until then, an
// unauthenticated request (e.g. GET /version) still works end-to-end.

let currentToken: string | null = null;

/** Set the current auth token (called by the sign-in flow once it exists). */
export function setAuthToken(token: string | null): void {
  currentToken = token;
}

/** Return a valid token, or null when signed out. */
export async function getToken(): Promise<string | null> {
  return currentToken;
}

/** Force a fresh token before the single 401 retry. No-op until auth is wired. */
export async function refreshToken(): Promise<void> {
  // TODO(mobile-auth): force-refresh via the auth SDK and update currentToken.
}

/** A genuinely-dead session. TODO(mobile-auth): navigate to the sign-in screen. */
export function onSessionExpired(_code: string | undefined): void {
  currentToken = null;
}
