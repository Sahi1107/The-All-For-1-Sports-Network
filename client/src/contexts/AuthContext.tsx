import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react';
import axios from 'axios';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  linkWithCredential,
  GoogleAuthProvider,
  signOut,
  type AuthCredential,
  type User as FirebaseUser,
} from 'firebase/auth';
import { auth, googleProvider } from '../config/firebase';
import { setSentryUser } from '../config/sentry';
import type { Sport } from '../data/sports';

const baseURL = (import.meta.env.VITE_API_URL ?? '') + '/api';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'ATHLETE' | 'COACH' | 'SCOUT' | 'TEAM' | 'AGENT' | 'MEDIA' | 'ADMIN';
  sport: Sport;
  gender?: 'MALE' | 'FEMALE';
  athleticsEvents?: string[];
  avatar?: string;
  bio?: string;
  location?: string;
  age?: number;
  height?: string;
  position?: string;
  verified: boolean;
  phoneVerified?: boolean;
  phone?: string;
  dateOfBirth?: string;
  guardianManaged?: boolean;
  handoverStatus?: 'NONE' | 'PENDING' | 'CONSENTED';
  discoverable?: boolean;
  mustResetPassword?: boolean;
}

interface RegisterData {
  email: string;
  password: string;
  name: string;
  role: 'ATHLETE' | 'COACH' | 'SCOUT' | 'TEAM' | 'AGENT' | 'MEDIA';
  sport: Sport;
  gender?: 'MALE' | 'FEMALE';
  athleticsEvents?: string[];
  age?: number;
  dateOfBirth?: string;
  location?: string;
  height?: string;
}

/**
 * Profile fields collected during Google onboarding. A Google account gives us
 * name/email/photo only, so the wizard fills in everything else — including the
 * mandatory date of birth that the under-13 guardian gate depends on.
 */
export type OnboardingData = Omit<RegisterData, 'email' | 'password'>;

/** Name/email/photo pulled from the Google account to pre-fill onboarding. */
export interface OnboardingPrefill {
  name: string;
  email: string;
  avatar: string | null;
}

/** Result of a Google sign-in attempt: whether the user still needs onboarding. */
type GoogleResult = { needsOnboarding: boolean };

interface AuthContextType {
  user: User | null;
  loading: boolean;
  unverifiedEmail: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updateUser: (user: User) => void;
  resendVerification: () => Promise<void>;
  // ── Google sign-in ──
  /** True when a Google session exists but its profile isn't complete yet. */
  needsOnboarding: boolean;
  /** Name/email/photo from Google to pre-fill the onboarding wizard. */
  onboardingPrefill: OnboardingPrefill | null;
  /** Set when Google was used with an email that already has a password account;
   *  the UI prompts for that password to link the two. */
  linkEmail: string | null;
  signInWithGoogle: () => Promise<GoogleResult>;
  completeGoogleOnboarding: (data: OnboardingData) => Promise<void>;
  linkGoogleToPassword: (password: string) => Promise<GoogleResult>;
  cancelGoogleLink: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper: make an authenticated axios call with an explicit token
// (used during login/sync before the axios interceptor can pick up the session)
async function authedGet(token: string, path: string) {
  return axios.get(`${baseURL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function authedPost(token: string, path: string, body: unknown) {
  return axios.post(`${baseURL}${path}`, body, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]             = useState<User | null>(null);
  const [loading, setLoading]       = useState(true);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [needsOnboarding, setNeedsOnboarding]     = useState(false);
  const [onboardingPrefill, setOnboardingPrefill] = useState<OnboardingPrefill | null>(null);
  const [linkEmail, setLinkEmail]   = useState<string | null>(null);
  // Google credential awaiting a link to an existing password account (flow D).
  const pendingGoogleCred = useRef<AuthCredential | null>(null);

  // Resolve a federated (Google) session against our backend. Either the Prisma
  // user already exists (→ set it and finish) or it doesn't (→ flag onboarding).
  // Never creates a half-formed user; onboarding is what supplies role + DOB.
  const finishProviderSignIn = async (firebaseUser: FirebaseUser): Promise<GoogleResult> => {
    const token = await firebaseUser.getIdToken();
    const { data } = await authedPost(token, '/auth/provider-signin', {});
    if (data.needsOnboarding) {
      setNeedsOnboarding(true);
      setOnboardingPrefill(data.prefill ?? {
        name: firebaseUser.displayName ?? '', email: firebaseUser.email ?? '', avatar: firebaseUser.photoURL ?? null,
      });
      setUser(null);
      return { needsOnboarding: true };
    }
    // Existing / just-linked user — force-refresh so the new custom claims land.
    const fresh = await firebaseUser.getIdToken(true);
    const me = await authedGet(fresh, '/auth/me');
    setUser(me.data.user);
    setUnverifiedEmail(null);
    setNeedsOnboarding(false);
    setOnboardingPrefill(null);
    return { needsOnboarding: false };
  };

  // Complete the redirect-based fallback (popup-blocked path). Success surfaces
  // via onAuthStateChanged below; here we only need to recover a link prompt if
  // the redirected email collides with an existing password account.
  useEffect(() => {
    getRedirectResult(auth).catch((err: any) => {
      console.error('[google-auth] getRedirectResult failed:', { code: err?.code, message: err?.message, stack: err?.stack, error: err });
      if (err?.code === 'auth/account-exists-with-different-credential') {
        pendingGoogleCred.current = GoogleAuthProvider.credentialFromError(err);
        setLinkEmail(err?.customData?.email ?? null);
      }
    });
  }, []);

  // Persist auth across page reloads — listen to Firebase auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setUnverifiedEmail(null);
        setNeedsOnboarding(false);
        setOnboardingPrefill(null);
        setLoading(false);
        return;
      }
      // Track unverified state but still let the user into the app
      setUnverifiedEmail(!firebaseUser.emailVerified ? firebaseUser.email : null);
      try {
        const token = await firebaseUser.getIdToken();
        const { data } = await authedGet(token, '/auth/me');
        setUser(data.user);
        setNeedsOnboarding(false);
      } catch {
        // No complete profile for this session. A Google user (fresh signup, or a
        // redirect that hasn't been resolved yet) must finish onboarding rather
        // than be silently locked out — resolve via provider-signin.
        const isGoogle = firebaseUser.providerData.some((p) => p.providerId === 'google.com');
        if (isGoogle) {
          try { await finishProviderSignIn(firebaseUser); }
          catch { setUser(null); setNeedsOnboarding(false); }
        } else {
          setUser(null);
          setNeedsOnboarding(false);
        }
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  // Keep Sentry error reports tagged with the current user (cleared on logout).
  useEffect(() => {
    setSentryUser(user ? { id: user.id, role: user.role } : null);
  }, [user]);

  // ── Register ─────────────────────────────────────────────────────────────

  const register = async ({ email, password, name, role, sport, gender, athleticsEvents, age, dateOfBirth, location, height }: RegisterData) => {
    // 1. Create Firebase Auth user
    const cred = await createUserWithEmailAndPassword(auth, email, password);

    // 2. Create Prisma user via /sync (before email is verified)
    //    The Prisma user must exist before we set custom claims.
    const rawToken = await cred.user.getIdToken();
    await authedPost(rawToken, '/auth/sync', {
      name, role, sport,
      ...(gender && { gender }),
      ...(athleticsEvents && athleticsEvents.length > 0 && { athleticsEvents }),
      ...(age !== undefined && { age }),
      ...(dateOfBirth && { dateOfBirth }),
      ...(location && { location }),
      ...(height && { height }),
    });

    // 3. Send Firebase verification email.
    //    continueUrl brings the user back to login after they click the link.
    await sendEmailVerification(cred.user, {
      url: `${window.location.origin}/login`,
    });

    // 4. Sign out so the user cannot access the app until they verify their email.
    await signOut(auth);
  };

  // ── Login ────────────────────────────────────────────────────────────────

  const login = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);

    if (!cred.user.emailVerified) {
      setUnverifiedEmail(cred.user.email);
      // Don't block — fall through and log them in
    }

    // Ensure custom claims are present (might be missing if sync was interrupted)
    let token = await cred.user.getIdToken();
    const decoded = JSON.parse(atob(token.split('.')[1]));
    if (!decoded.userId) {
      // Custom claims missing — call sync to set them, then force-refresh the token.
      // The server handles both existing users (by UID) and orphaned users (by email)
      // without requiring any body data, so this call is always safe.
      try {
        await authedPost(token, '/auth/sync', {});
      } catch {
        // If sync fails the account may be genuinely incomplete; sign out cleanly.
        await signOut(auth);
        const err: any = new Error('Account setup is incomplete. Please contact support.');
        err.code = 'SYNC_FAILED';
        throw err;
      }
      token = await cred.user.getIdToken(true);
    }

    const { data } = await authedGet(token, '/auth/me');
    setUser(data.user);
  };

  // ── Logout ───────────────────────────────────────────────────────────────

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    setUnverifiedEmail(null);
  };

  const resendVerification = async () => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) throw new Error('No active session');
    await sendEmailVerification(firebaseUser, { url: `${window.location.origin}/login` });
  };

  // ── Password reset (purely Firebase — no backend involved) ───────────────

  const sendPasswordReset = async (email: string) => {
    await firebaseSendPasswordResetEmail(auth, email, {
      url: `${window.location.origin}/login`,
    });
  };

  const updateUser = (updatedUser: User) => setUser(updatedUser);

  // ── Google sign-in ─────────────────────────────────────────────────────────

  const signInWithGoogle = async (): Promise<GoogleResult> => {
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      return await finishProviderSignIn(cred.user);
    } catch (err: any) {
      const code = err?.code ?? '';

      // Surface the real Firebase error — a generic toast otherwise swallows it.
      // Skip the benign "user closed the popup" cases so the console isn't noisy.
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        console.error('[google-auth] signInWithGoogle failed:', { code, message: err?.message, stack: err?.stack, error: err });
      }

      // User dismissed the chooser / a second popup superseded this one — no error UI.
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        const e: any = new Error('Sign-in cancelled'); e.code = 'CANCELLED'; throw e;
      }

      // Popup blocked (or unsupported context) — fall back to a full-page redirect.
      // The result is picked up by getRedirectResult / onAuthStateChanged on return.
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(auth, googleProvider);
        return { needsOnboarding: false };
      }

      // Same email already registered with password — stash the pending Google
      // credential and ask the UI to collect the password so we can link them.
      if (code === 'auth/account-exists-with-different-credential') {
        pendingGoogleCred.current = GoogleAuthProvider.credentialFromError(err);
        const email = err?.customData?.email as string | undefined;
        setLinkEmail(email ?? null);
        const e: any = new Error('This email already has an account. Enter your password to connect Google.');
        e.code = 'LINK_REQUIRED'; e.email = email; throw e;
      }

      // network-request-failed and anything else surface to the caller for a toast.
      throw err;
    }
  };

  // Google gave us name/email/photo; the wizard supplies the rest. This POSTs the
  // SAME /auth/sync as email/password signup, so DOB validation and the under-13
  // guardian logic apply identically — the Prisma user is created here, complete,
  // or not at all.
  const completeGoogleOnboarding = async (data: OnboardingData) => {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) {
      const e: any = new Error('Your Google session expired. Please sign in again.'); e.code = 'NO_SESSION'; throw e;
    }
    const token = await firebaseUser.getIdToken();
    await authedPost(token, '/auth/sync', {
      name: data.name, role: data.role, sport: data.sport,
      ...(data.gender && { gender: data.gender }),
      ...(data.athleticsEvents && data.athleticsEvents.length > 0 && { athleticsEvents: data.athleticsEvents }),
      ...(data.age !== undefined && { age: data.age }),
      ...(data.dateOfBirth && { dateOfBirth: data.dateOfBirth }),
      ...(data.location && { location: data.location }),
      ...(data.height && { height: data.height }),
    });
    const fresh = await firebaseUser.getIdToken(true);
    const { data: me } = await authedGet(fresh, '/auth/me');
    setUser(me.user);
    setUnverifiedEmail(null);
    setNeedsOnboarding(false);
    setOnboardingPrefill(null);
  };

  // Flow D: sign in with the existing password, then attach the pending Google
  // credential to that same Firebase account (one UID → one Prisma user).
  const linkGoogleToPassword = async (password: string): Promise<GoogleResult> => {
    if (!linkEmail || !pendingGoogleCred.current) {
      const e: any = new Error('No pending Google link.'); e.code = 'NO_PENDING_LINK'; throw e;
    }
    const cred = await signInWithEmailAndPassword(auth, linkEmail, password);
    await linkWithCredential(cred.user, pendingGoogleCred.current);
    pendingGoogleCred.current = null;
    setLinkEmail(null);
    return await finishProviderSignIn(cred.user);
  };

  const cancelGoogleLink = () => {
    pendingGoogleCred.current = null;
    setLinkEmail(null);
  };

  return (
    <AuthContext.Provider value={{
      user, loading, unverifiedEmail, login, register, logout, sendPasswordReset, updateUser, resendVerification,
      needsOnboarding, onboardingPrefill, linkEmail,
      signInWithGoogle, completeGoogleOnboarding, linkGoogleToPassword, cancelGoogleLink,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
