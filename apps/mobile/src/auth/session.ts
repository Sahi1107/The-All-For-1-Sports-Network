import { currentIdToken } from './firebase';
import { readToken, clearToken } from './secureToken';

// The seam @af1/api-client is wired to (src/api/client.ts). Real now, not a stub:
//   getToken      → the live Firebase ID token (auto-refreshed near expiry by the
//                   SDK), cached to secure storage; falls back to the cached token
//                   on a cold start before the SDK has rehydrated the user.
//   refreshToken  → force a fresh token for the single 401 retry.
//   onSessionExpired → a genuinely-dead session: drop the cached token and let the
//                   registered handler (AuthProvider) reset to signed-out.

let expiredHandler: (code: string | undefined) => void = () => {};

/** AuthProvider registers here so a dead 401 can reset app state without this
 *  low-level module importing the router (which would be a cycle). */
export function setSessionExpiredHandler(fn: (code: string | undefined) => void): void {
  expiredHandler = fn;
}

export async function getToken(): Promise<string | null> {
  const live = await currentIdToken(false);
  if (live) return live;
  return readToken();
}

export async function refreshToken(): Promise<void> {
  await currentIdToken(true);
}

export function onSessionExpired(code: string | undefined): void {
  void clearToken();
  expiredHandler(code);
}
