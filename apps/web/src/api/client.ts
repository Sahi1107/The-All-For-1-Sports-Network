import { createApiClient } from '@af1/api-client';
import { auth } from '../config/firebase';

// The web adapter over the shared @af1/api-client. The instance, the auth-header
// attachment, and the transient-401 recovery all live in the package (so mobile
// behaves identically); this file only supplies the web-specific seams: the Vite
// build-time API origin, the Firebase Web SDK for tokens, and a browser redirect
// on a dead session.
//
// In development the Vite dev proxy forwards /api to the server automatically.
// In production set VITE_API_URL to the public API origin.
// NEVER put secret values (API keys, JWT secrets, database URLs) in VITE_ vars.
const api = createApiClient({
  baseURL: (import.meta.env.VITE_API_URL ?? '') + '/api',

  // The Firebase SDK auto-refreshes the token near expiry, so the plain call
  // always returns a valid token without manual retry logic.
  getToken: async () => (auth.currentUser ? auth.currentUser.getIdToken() : null),

  // Force a fresh token for the single 401 retry.
  refreshToken: async () => {
    if (auth.currentUser) await auth.currentUser.getIdToken(true);
  },

  // A genuinely-unrecoverable 401. On an explicitly revoked session, clear the
  // Firebase session too so this device doesn't loop back in stale.
  onSessionExpired: (code) => {
    if (code === 'SESSION_REVOKED') {
      auth.signOut().catch(() => {}).finally(() => { window.location.href = '/login'; });
    } else {
      window.location.href = '/login';
    }
  },
});

export default api;
