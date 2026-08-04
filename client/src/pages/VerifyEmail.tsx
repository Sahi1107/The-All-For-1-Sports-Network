import BallLoader from '../components/BallLoader';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { applyActionCode } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useLogo } from '../hooks/useLogo';
import { CheckCircle, XCircle } from 'lucide-react';

export default function VerifyEmail() {
  const logoUrl = useLogo();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshVerification } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  // Where to send them once verified: back into the app if they have a session
  // here, otherwise to sign in (a fresh login mints a verified token).
  const [target, setTarget] = useState<'/home' | '/login'>('/login');

  // The oobCode is single-use — applying it twice fails with "already used". Run
  // exactly once regardless of re-renders / StrictMode double-invoke.
  const ran = useRef(false);
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const oobCode = searchParams.get('oobCode');
    if (!oobCode) {
      setStatus('error');
      setErrorMsg('Invalid or missing verification link.');
      return;
    }
    applyActionCode(auth, oobCode)
      .then(async () => {
        // Don't strand them on a confirmation page. Show success immediately, then:
        // if they're signed in here, refresh the session so emailVerified
        // propagates (post gate opens + DB record re-syncs) and drop them home;
        // if not, the effect below sends them to sign in.
        const signedIn = !!auth.currentUser;
        setTarget(signedIn ? '/home' : '/login');
        setStatus('success');
        if (signedIn) {
          try { await refreshVerification(); } catch { /* still route them on */ }
          navigate('/home', { replace: true });
        }
      })
      .catch((err: { code?: string }) => {
        setStatus('error');
        const code = err.code ?? '';
        if (code === 'auth/expired-action-code' || code === 'auth/invalid-action-code') {
          setErrorMsg('This verification link has expired or already been used. Request a new one from the sign-in page.');
        } else {
          setErrorMsg('Verification failed. Please try again.');
        }
      });
    // Run once on mount (guarded by `ran`); refreshVerification/navigate read live
    // state internally, so stale closures aren't a concern.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Not-signed-in case: briefly show "verified", then hand off to sign-in (the
  // signed-in case navigates home directly above). Either way, never a dead end.
  useEffect(() => {
    if (status !== 'success' || target !== '/login') return;
    const t = setTimeout(() => navigate('/login', { replace: true }), 1600);
    return () => clearTimeout(t);
  }, [status, target, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md text-center">
        <img src={logoUrl} alt="All For 1" className="h-20 mx-auto mb-8" />
        <div className="bg-card rounded-2xl p-8 border border-line">
          {status === 'loading' && (
            <>
              <BallLoader />
              <p className="text-gray-custom">Verifying your email…</p>
            </>
          )}
          {status === 'success' && (
            <>
              <CheckCircle size={48} className="text-primary mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Email verified</h2>
              <p className="text-gray-custom text-sm mb-6">
                {target === '/home'
                  ? "You're all set — taking you back to All For 1…"
                  : 'Your email is confirmed. Sign in to start posting…'}
              </p>
              <Link
                to={target}
                replace
                className="block w-full py-3 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg transition-colors"
              >
                {target === '/home' ? 'Continue' : 'Sign in'}
              </Link>
            </>
          )}
          {status === 'error' && (
            <>
              <XCircle size={48} className="text-red-400 mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Verification Failed</h2>
              <p className="text-gray-custom text-sm mb-6">{errorMsg}</p>
              <Link
                to="/login"
                className="block w-full py-3 bg-surface border border-line text-foreground font-semibold rounded-lg hover:bg-elevated transition-colors"
              >
                Back to Sign In
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
