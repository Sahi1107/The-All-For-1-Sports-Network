import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import toast from 'react-hot-toast';
import { X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

// Official Google "G" mark. Keeping it as inline SVG (rather than a raster asset)
// meets Google's branding requirements and stays crisp at any density.
function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>
  );
}

/**
 * "Continue with Google" button + the account-linking prompt.
 *
 * Web only: `signInWithPopup` doesn't work inside the Capacitor native webview,
 * so the button is hidden there (email/password remains available). Native Google
 * Sign-In is a separate follow-up requiring a native plugin + platform OAuth config.
 */
export default function GoogleAuthButton({
  label = 'Continue with Google',
  divider = false,
}: { label?: string; divider?: boolean }) {
  const { signInWithGoogle, linkEmail, linkGoogleToPassword, cancelGoogleLink } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [linkPassword, setLinkPassword] = useState('');
  const [linking, setLinking] = useState(false);

  if (Capacitor.isNativePlatform()) return null;

  const routeAfter = (res: { needsOnboarding: boolean }) =>
    navigate(res.needsOnboarding ? '/onboarding' : '/home');

  const handleGoogle = async () => {
    setLoading(true);
    try {
      const res = await signInWithGoogle();
      routeAfter(res);
    } catch (err: any) {
      const code = err?.code ?? '';
      if (code !== 'CANCELLED' && code !== 'LINK_REQUIRED') {
        console.error('[google-auth] handleGoogle failed:', { code, message: err?.message, stack: err?.stack, error: err });
      }
      if (code === 'CANCELLED' || code === 'LINK_REQUIRED') {
        // CANCELLED → user backed out, no error. LINK_REQUIRED → the modal below
        // opens automatically (driven by `linkEmail`); nothing to toast.
      } else if (code === 'auth/network-request-failed') {
        toast.error('Network error — check your connection and try again.');
      } else {
        toast.error(err?.message || 'Google sign-in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkPassword) return;
    setLinking(true);
    try {
      const res = await linkGoogleToPassword(linkPassword);
      setLinkPassword('');
      routeAfter(res);
    } catch (err: any) {
      const code = err?.code ?? err?.message ?? '';
      console.error('[google-auth] linkGoogleToPassword failed:', { code, message: err?.message, stack: err?.stack, error: err });
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        toast.error('Incorrect password. Please try again.');
      } else if (code === 'auth/too-many-requests') {
        toast.error('Too many attempts. Please wait a moment and try again.');
      } else {
        toast.error('Could not connect your Google account. Please try again.');
      }
    } finally {
      setLinking(false);
    }
  };

  const closeLink = () => { cancelGoogleLink(); setLinkPassword(''); };

  return (
    <>
      {/* Optional "or" divider — kept inside the component so the whole block
          (divider + button) disappears together in the native app. */}
      {divider && (
        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-line" />
          <span className="text-xs text-gray-custom">or</span>
          <div className="flex-1 h-px bg-line" />
        </div>
      )}
      <button
        type="button"
        onClick={handleGoogle}
        disabled={loading}
        className="w-full flex items-center justify-center gap-3 py-3 rounded-lg bg-white text-[#1f1f1f] font-medium border border-line hover:bg-gray-100 transition-colors disabled:opacity-60"
      >
        <GoogleG />
        {loading ? 'Connecting…' : label}
      </button>

      {/* Account-linking prompt — same email already has a password account. */}
      {linkEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm bg-card border border-line rounded-2xl p-6 relative">
            <button type="button" onClick={closeLink}
              className="absolute top-4 right-4 text-gray-custom hover:text-foreground transition-colors" aria-label="Cancel">
              <X size={18} />
            </button>
            <h3 className="text-lg font-semibold mb-2">Connect your Google account</h3>
            <p className="text-sm text-gray-custom mb-4">
              You already have an All For 1 account for{' '}
              <span className="text-foreground font-medium break-all">{linkEmail}</span>.
              Enter your password to link Google to it.
            </p>
            <form onSubmit={handleLink} className="space-y-3">
              <input
                type="password"
                autoFocus
                value={linkPassword}
                onChange={(e) => setLinkPassword(e.target.value)}
                placeholder="Your password"
                className="w-full px-4 py-3 bg-surface border border-line rounded-lg focus:outline-none focus:border-primary text-foreground"
              />
              <button type="submit" disabled={linking || !linkPassword}
                className="w-full py-3 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg transition-colors disabled:opacity-50">
                {linking ? 'Connecting…' : 'Connect Google'}
              </button>
              <button type="button" onClick={closeLink}
                className="w-full py-2 text-gray-custom hover:text-foreground transition-colors text-sm">
                Cancel
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
