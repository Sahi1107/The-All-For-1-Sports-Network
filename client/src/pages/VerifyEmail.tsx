import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { applyActionCode } from 'firebase/auth';
import { auth } from '../config/firebase';
import logoUrl from '../assets/logo.svg';
import { CheckCircle, XCircle } from 'lucide-react';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const oobCode = searchParams.get('oobCode');
    if (!oobCode) {
      setStatus('error');
      setErrorMsg('Invalid or missing verification link.');
      return;
    }
    applyActionCode(auth, oobCode)
      .then(() => setStatus('success'))
      .catch((err: any) => {
        setStatus('error');
        const code = err.code ?? '';
        if (code === 'auth/expired-action-code' || code === 'auth/invalid-action-code') {
          setErrorMsg('This verification link has expired or already been used. Request a new one from the sign-in page.');
        } else {
          setErrorMsg('Verification failed. Please try again.');
        }
      });
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark p-4">
      <div className="w-full max-w-md text-center">
        <img src={logoUrl} alt="All For 1" className="h-20 mx-auto mb-8" />
        <div className="bg-dark-light rounded-2xl p-8 border border-dark-lighter">
          {status === 'loading' && (
            <>
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-custom">Verifying your email…</p>
            </>
          )}
          {status === 'success' && (
            <>
              <CheckCircle size={48} className="text-primary mx-auto mb-4" />
              <h2 className="text-xl font-semibold mb-2">Email Verified</h2>
              <p className="text-gray-custom text-sm mb-6">
                Your email has been verified. You can now sign in to your account.
              </p>
              <Link
                to="/login"
                className="block w-full py-3 bg-primary hover:bg-primary-dark text-dark font-semibold rounded-lg transition-colors"
              >
                Sign In
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
                className="block w-full py-3 bg-dark border border-dark-lighter text-white font-semibold rounded-lg hover:bg-dark-lighter transition-colors"
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
