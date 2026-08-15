import Constants from 'expo-constants';

// The API origin, resolved once. Order: an EXPO_PUBLIC_ env override (handy for
// pointing a dev build at a local server) wins; otherwise the value baked into
// app.json's `extra.apiUrl`. The `/api` prefix is appended here so callers use
// bare paths (`api.get('/version')`), exactly like the web client.
const extra = (Constants.expoConfig?.extra ?? {}) as { apiUrl?: string };
const origin = process.env.EXPO_PUBLIC_API_URL ?? extra.apiUrl ?? '';

export const API_BASE_URL = `${origin}/api`;
