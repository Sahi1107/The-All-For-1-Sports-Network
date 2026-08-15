import api from './client';

// The current user's profile, shaped to what GET /api/auth/me returns (its
// `meSelect`). Only the fields the mobile app reads are typed here; the endpoint
// returns a superset.
export interface Profile {
  id: string;
  name: string;
  email: string | null;
  role: string;
  sport: string | null;
  gender: string | null;
  avatar: string | null;
  bio: string | null;
  location: string | null;
  age: number | null;
  height: string | null;
  position: string | null;
  achievements: string | null;
  verified: boolean;
  phoneVerified: boolean;
  phone: string | null;
  createdAt: string;
  guardianManaged: boolean;
  profileComplete?: boolean;
  profileMissing?: string[];
}

/** GET /api/auth/me — the signed-in user's profile. Throws on non-2xx (the caller
 *  distinguishes 401/404/offline). */
export async function fetchMe(): Promise<Profile> {
  const res = await api.get('/auth/me');
  return res.data.user as Profile;
}

export interface ProviderSigninResult {
  user?: Profile;
  needsOnboarding: boolean;
  refreshClaims?: boolean;
  prefill?: { name: string; email: string; avatar: string | null };
}

/** POST /api/auth/provider-signin — run right after a federated (Google/Apple)
 *  Firebase sign-in. Resolves the account: existing/linked → user; brand-new →
 *  needsOnboarding. A 409 (email owned by a different Firebase UID) is thrown for
 *  the caller to route into the link flow. */
export async function providerSignin(): Promise<ProviderSigninResult> {
  const res = await api.post('/auth/provider-signin');
  return res.data as ProviderSigninResult;
}
