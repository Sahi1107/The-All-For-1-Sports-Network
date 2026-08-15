import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { firebaseAuth, signOutFirebase } from './firebase';
import { refreshToken, setSessionExpiredHandler } from './session';
import { signInWithGoogle, SignInCancelled } from './google';
import { signInWithApple } from './apple';
import { fetchMe, providerSignin, type Profile } from '../api/me';

// Auth is a small state machine, deliberately explicit so every screen can render
// the right thing:
//   initializing  – waiting on Firebase's first auth-state callback (cold start)
//   unauthenticated – no Firebase user (show sign-in)
//   bootstrapping – have a Firebase user, resolving our profile
//   onboarding    – signed in with a provider but no platform profile yet
//   authenticated – profile loaded (the app)
//   offline       – bootstrap failed on the network (retryable, not a dead end)
export type AuthStatus =
  | 'initializing'
  | 'unauthenticated'
  | 'bootstrapping'
  | 'onboarding'
  | 'authenticated'
  | 'offline';

type Provider = 'google' | 'apple';

interface AuthContextValue {
  status: AuthStatus;
  profile: Profile | null;
  signingIn: Provider | null;
  /** A non-fatal message to show on the sign-in screen (cancel is silent). */
  notice: string | null;
  signInGoogle: () => Promise<void>;
  signInApple: () => Promise<void>;
  signOut: () => Promise<void>;
  retry: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function isNetworkError(err: unknown): boolean {
  const e = err as { response?: unknown; message?: string };
  return !e.response && (e.message === 'Network Error' || e.message?.includes('timeout') === true || !!e.message);
}
function statusOf(err: unknown): number | undefined {
  return (err as { response?: { status?: number } }).response?.status;
}
function codeOf(err: unknown): string | undefined {
  return (err as { response?: { data?: { code?: string } } }).response?.data?.code;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('initializing');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [signingIn, setSigningIn] = useState<Provider | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const bootstrapping = useRef(false);

  // Resolve the signed-in Firebase user into our profile. Idempotent: provider-
  // signin sets custom claims + detects onboarding/link, then /auth/me loads the
  // profile. Runs on any signed-in transition (cold start or a fresh sign-in).
  const bootstrap = useCallback(async () => {
    if (bootstrapping.current) return;
    bootstrapping.current = true;
    setStatus('bootstrapping');
    try {
      const result = await providerSignin();
      if (result.needsOnboarding) {
        setProfile(null);
        setStatus('onboarding');
        return;
      }
      if (result.refreshClaims) await refreshToken(); // token now carries { userId, role }
      const me = await fetchMe();
      setProfile(me);
      setStatus('authenticated');
    } catch (err) {
      if (statusOf(err) === 409 && codeOf(err) === 'ACCOUNT_EXISTS_DIFFERENT_CREDENTIAL') {
        // Apple/Google identity whose email already belongs to another account.
        // Per our identity model we never silently merge — guide them to link.
        setNotice('This email already has an account. Sign in with your original method to connect this one.');
        await signOutFirebase();
        setProfile(null);
        setStatus('unauthenticated');
      } else if (!statusOf(err) && isNetworkError(err)) {
        setStatus('offline');
      } else {
        setNotice('Something went wrong signing you in. Please try again.');
        await signOutFirebase();
        setStatus('unauthenticated');
      }
    } finally {
      bootstrapping.current = false;
      setSigningIn(null);
    }
  }, []);

  // Single source of truth for signed-in/out: Firebase's own listener. Every
  // sign-in method ends by updating currentUser, which lands here.
  useEffect(() => {
    const unsub = firebaseAuth.onAuthStateChanged((user) => {
      if (user) {
        void bootstrap();
      } else {
        setProfile(null);
        setStatus('unauthenticated');
      }
    });
    // A dead 401 from any API call resets us to signed-out cleanly.
    setSessionExpiredHandler(() => { void signOutFirebase(); });
    return unsub;
  }, [bootstrap]);

  const runSignIn = useCallback(async (provider: Provider, fn: () => Promise<void>) => {
    setNotice(null);
    setSigningIn(provider);
    try {
      await fn(); // onAuthStateChanged → bootstrap takes over from here
    } catch (err) {
      setSigningIn(null);
      if (err instanceof SignInCancelled) return; // user backed out — silent
      setNotice('Could not sign in. Please try again.');
    }
  }, []);

  const value: AuthContextValue = {
    status,
    profile,
    signingIn,
    notice,
    signInGoogle: () => runSignIn('google', signInWithGoogle),
    signInApple: () => runSignIn('apple', signInWithApple),
    signOut: async () => { await signOutFirebase(); },
    retry: () => { void bootstrap(); },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
