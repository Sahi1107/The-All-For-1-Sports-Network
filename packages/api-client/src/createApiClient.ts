import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { shouldRetryWithFreshToken, shouldRedirectToLogin } from './authRetry';

// The shared HTTP client. One axios instance, one auth-recovery policy, used by
// both web and mobile. Everything platform-specific is INJECTED, never imported
// here: where the base URL comes from (Vite env vs a native config), how a token
// is obtained and force-refreshed (web Firebase SDK vs the RN SDK), and what
// "session expired" does (a web redirect vs a native navigation reset). The
// transient-401 recovery that keeps a scorer from being dumped mid-match lives
// here once, so both platforms behave identically.

export interface ApiClientConfig {
  /** Fully-qualified API origin including the `/api` prefix, e.g. `https://api.example.com/api`. */
  baseURL: string;
  /**
   * Return a currently-valid auth token, or null when signed out. Called before
   * every request. Implementations should let their SDK hand back its cached
   * token (which it refreshes near expiry) — do NOT force a network refresh here.
   */
  getToken: () => Promise<string | null>;
  /**
   * Force a fresh token, bypassing the cache. Called once on a recoverable 401
   * just before the single retry. May reject if the refresh itself fails, in
   * which case the request is not retried and the session-expiry path runs.
   */
  refreshToken: () => Promise<void>;
  /**
   * A genuinely-unrecoverable 401 (revoked session, or a 401 that survived the
   * retry). `code` is the server's error code when present (e.g. `SESSION_REVOKED`)
   * so the caller can, say, sign out locally before redirecting. This must NOT
   * fire for other statuses — a 403 from a revoked role is handled by the caller
   * in place, never a forced logout.
   */
  onSessionExpired: (code: string | undefined) => void;
  /** Extra default headers merged onto every request. `Content-Type: application/json` is set unless overridden. */
  headers?: Record<string, string>;
}

// axios request config, plus our one-retry flag (never retry more than once).
type RetryConfig = InternalAxiosRequestConfig & { _retried?: boolean };

export function createApiClient(config: ApiClientConfig): AxiosInstance {
  const api = axios.create({
    baseURL: config.baseURL,
    headers: { 'Content-Type': 'application/json', ...(config.headers ?? {}) },
  });

  // Attach a valid token before every request. getToken() returns the SDK's
  // cached token, which is auto-refreshed near expiry, so no manual refresh here.
  api.interceptors.request.use(async (requestConfig) => {
    const token = await config.getToken();
    if (token) {
      requestConfig.headers.Authorization = `Bearer ${token}`;
    }
    return requestConfig;
  });

  // On 401: recover a transient failure by force-refreshing the token and retrying
  // ONCE before giving up. Only a genuinely-unrecoverable 401 (revoked session, or
  // a 401 that survives the retry) reaches onSessionExpired — so a token blip never
  // dumps someone mid-task (a scorer mid-match, especially). A 403 is NOT handled
  // here — the caller shows it in place.
  api.interceptors.response.use(
    (response) => response,
    async (error) => {
      const status: number | undefined = error.response?.status;
      const code: string | undefined = error.response?.data?.code;
      const requestConfig = error.config as RetryConfig | undefined;

      if (requestConfig && shouldRetryWithFreshToken(status, code, requestConfig.url, requestConfig._retried ?? false)) {
        try {
          await config.refreshToken();     // force a fresh token
          requestConfig._retried = true;   // per-request flag — at most one retry
          return await api(requestConfig); // the request interceptor attaches the fresh token
        } catch {
          /* refresh itself failed — fall through to the session-expiry decision */
        }
      }

      if (shouldRedirectToLogin(status, requestConfig?.url)) {
        config.onSessionExpired(code);
      }
      return Promise.reject(error);
    },
  );

  return api;
}
