// Barrel for @af1/api-client — the shared HTTP client for web and mobile. Each
// platform calls createApiClient() with its own token source and session-expiry
// action; the request/response + transient-401-recovery behaviour is identical
// across both. The pure retry-decision helpers are exported for direct testing.
export { createApiClient, type ApiClientConfig } from './createApiClient';
export { shouldRetryWithFreshToken, shouldRedirectToLogin } from './authRetry';
