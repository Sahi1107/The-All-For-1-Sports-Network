import { createApiClient } from '@af1/api-client';
import { API_BASE_URL } from '../config/env';
import { getToken, refreshToken, onSessionExpired } from '../auth/session';

// The mobile adapter over the shared @af1/api-client. The instance, the auth
// header, and the transient-401 recovery all live in the package — identical to
// web. This file only supplies the native seams: the API origin (from app config)
// and the token source (src/auth/session). All screens import this default.
const api = createApiClient({
  baseURL: API_BASE_URL,
  getToken,
  refreshToken,
  onSessionExpired,
});

export default api;
