import axios, { type InternalAxiosRequestConfig } from 'axios';
import { auth } from '../config/firebase';
import { shouldRetryWithFreshToken, shouldRedirectToLogin } from './authRetry';

// axios request config, plus our one-retry flag (never retry more than once).
type RetryConfig = InternalAxiosRequestConfig & { _retried?: boolean };

// In development the Vite dev proxy forwards /api to the server automatically.
// In production set VITE_API_URL to the public API origin.
// NEVER put secret values (API keys, JWT secrets, database URLs) in VITE_ vars.
const baseURL = (import.meta.env.VITE_API_URL ?? '') + '/api';

const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach a fresh Firebase ID token before every request.
// The Firebase SDK automatically refreshes the token when it is near expiry,
// so getIdToken() always returns a valid token without manual retry logic.
api.interceptors.request.use(async (config) => {
  const firebaseUser = auth.currentUser;
  if (firebaseUser) {
    const token = await firebaseUser.getIdToken();
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401: recover a transient failure by refreshing the token and retrying ONCE
// before giving up. Only a genuinely-unrecoverable 401 (revoked session, or a 401
// that survives the retry) sends the user to /login — so a token blip never dumps
// someone mid-task (a scorer mid-match, especially). A 403 (e.g. a revoked
// tournament role) is NOT handled here — the caller shows it in place.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status: number | undefined = error.response?.status;
    const code: string | undefined = error.response?.data?.code;
    const config = error.config as RetryConfig | undefined;

    if (config && shouldRetryWithFreshToken(status, code, config.url, config._retried ?? false)) {
      const firebaseUser = auth.currentUser;
      if (firebaseUser) {
        try {
          await firebaseUser.getIdToken(true); // force a fresh token
          config._retried = true;              // per-request flag — at most one retry
          return await api(config);            // the request interceptor attaches the fresh token
        } catch {
          /* refresh itself failed — fall through to the redirect decision */
        }
      }
    }

    if (shouldRedirectToLogin(status, config?.url)) {
      if (code === 'SESSION_REVOKED') {
        // Clear the Firebase session too so this device doesn't loop back in stale.
        auth.signOut().catch(() => {}).finally(() => { window.location.href = '/login'; });
      } else {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export default api;
