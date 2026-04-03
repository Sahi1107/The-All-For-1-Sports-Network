import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import axios from 'axios';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  signOut,
} from 'firebase/auth';
import { auth } from '../config/firebase';

const baseURL = (import.meta.env.VITE_API_URL ?? '') + '/api';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'ATHLETE' | 'COACH' | 'SCOUT' | 'ADMIN';
  sport: 'BASKETBALL' | 'FOOTBALL' | 'CRICKET';
  avatar?: string;
  bio?: string;
  location?: string;
  age?: number;
  height?: string;
  position?: string;
  verified: boolean;
}

interface RegisterData {
  email: string;
  password: string;
  name: string;
  role: 'ATHLETE' | 'COACH' | 'SCOUT';
  sport: 'BASKETBALL' | 'FOOTBALL' | 'CRICKET';
  age: number;
  location?: string;
  height?: string;
}

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

  // Persist auth across page reloads — listen to Firebase auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setUnverifiedEmail(null);
        setLoading(false);
        return;
      }
      if (!firebaseUser.emailVerified) {
        setUser(null);
        setUnverifiedEmail(firebaseUser.email);
        setLoading(false);
        return;
      }
      // Email is verified — fetch app user
      setUnverifiedEmail(null);
      try {
        const token = await firebaseUser.getIdToken();
        const { data } = await authedGet(token, '/auth/me');
        setUser(data.user);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  // ── Register ─────────────────────────────────────────────────────────────

  const register = async ({ email, password, name, role, sport, age, location, height }: RegisterData) => {
    // 1. Create Firebase Auth user
    const cred = await createUserWithEmailAndPassword(auth, email, password);

    // 2. Create Prisma user via /sync (before email is verified)
    //    The Prisma user must exist before we set custom claims.
    const rawToken = await cred.user.getIdToken();
    await authedPost(rawToken, '/auth/sync', { name, role, sport, age, location, height });

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
      // Keep the session alive — onAuthStateChanged will set unverifiedEmail
      // and routing will redirect the user to /verify-pending.
      setUnverifiedEmail(cred.user.email);
      return;
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

  return (
    <AuthContext.Provider value={{ user, loading, unverifiedEmail, login, register, logout, sendPasswordReset, updateUser, resendVerification }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
