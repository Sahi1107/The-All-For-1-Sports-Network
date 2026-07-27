import axios from 'axios';
import { auth } from '../config/firebase';

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

// On 401, redirect to login — Firebase handles token refresh automatically
// so a 401 means the session is genuinely invalid (account deleted, etc.).
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Don't redirect on /auth/sync — that endpoint is called pre-login
      if (!error.config?.url?.includes('/auth/sync')) {
        // A revoked session ("sign out of all devices" from elsewhere): clear the
        // Firebase session too so this device doesn't loop back in with a stale
        // token, then land on login. Other 401s just redirect.
        if (error.response?.data?.code === 'SESSION_REVOKED') {
          auth.signOut().catch(() => {}).finally(() => { window.location.href = '/login'; });
        } else {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  },
);

export default api;
