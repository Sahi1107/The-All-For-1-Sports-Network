import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../config/firebase';
import toast from 'react-hot-toast';
import logoUrl from '../assets/logo.svg';

export default function VerifyEmailPending() {
  const { unverifiedEmail, logout, resendVerification } = useAuth();
  const navigate = useNavigate();
  const [resending, setResending] = useState(false);

  // If there's no unverified session, go to login
  useEffect(() => {
    if (!unverifiedEmail) navigate('/login', { replace: true });
  }, [unverifiedEmail, navigate]);

  // Poll every 4 s — if the user verified in another tab, auto-advance
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        await auth.currentUser?.reload();
        if (auth.currentUser?.emailVerified) navigate('/login', { replace: true });
      } catch { /* network hiccup — ignore */ }
    }, 4000);
    return () => clearInterval(id);
  }, [navigate]);

  const handleResend = async () => {
    setResending(true);
    try {
      await resendVerification();
      toast.success('Verification email sent — check your inbox and spam folder.');
    } catch (err: any) {
      const code: string = err?.code ?? '';
      if (code === 'auth/too-many-requests') {
        toast.error('Please wait a minute before requesting another email.');
      } else {
        toast.error('Could not resend. Please try again.');
      }
    } finally {
      setResending(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  if (!unverifiedEmail) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark p-4">
      <div className="w-full max-w-md text-center">
        <img src={logoUrl} alt="All For 1" className="h-20 mx-auto mb-8" />

        <div className="bg-dark-light rounded-2xl p-8 border border-dark-lighter space-y-5">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <Mail size={32} className="text-primary" />
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-2">Verify your email</h2>
            <p className="text-gray-custom text-sm">
              We sent a verification link to{' '}
              <span className="text-white font-medium">{unverifiedEmail}</span>.
              Click it to activate your account.
            </p>
          </div>

          <p className="text-yellow-400/80 text-xs">
            Can't find it? Check your <span className="font-semibold">spam or junk folder</span>.
          </p>

          <button
            onClick={handleResend}
            disabled={resending}
            className="w-full flex items-center justify-center gap-2 py-3 bg-primary hover:bg-primary-dark disabled:opacity-50 text-dark font-semibold rounded-lg transition-colors"
          >
            <RefreshCw size={15} className={resending ? 'animate-spin' : ''} />
            {resending ? 'Sending…' : 'Resend verification email'}
          </button>

          <button
            onClick={handleSignOut}
            className="w-full py-2 text-sm text-gray-custom hover:text-white transition-colors"
          >
            Use a different account
          </button>
        </div>
      </div>
    </div>
  );
}
