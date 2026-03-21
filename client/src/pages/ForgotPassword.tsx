import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import logoUrl from '../assets/logo.svg';
import { Mail } from 'lucide-react';

export default function ForgotPassword() {
  const { sendPasswordReset } = useAuth();
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await sendPasswordReset(email);
    } catch {
      // Always show success to prevent email enumeration.
      // Firebase surfaces no error for unregistered emails.
    } finally {
      setSent(true);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src={logoUrl} alt="All For 1" className="h-20 mx-auto mb-4" />
        </div>

        <div className="bg-dark-light rounded-2xl p-8 border border-dark-lighter">
          {sent ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail size={32} className="text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Check your email</h2>
              <p className="text-gray-custom text-sm mb-6">
                If <span className="text-white font-medium">{email}</span> is registered you'll
                receive a password reset link shortly. Follow it to set a new password.
              </p>
              <Link
                to="/login"
                className="block w-full py-3 bg-primary hover:bg-primary-dark text-dark font-semibold rounded-lg transition-colors"
              >
                Back to Sign In
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold mb-2">Forgot Password</h2>
              <p className="text-gray-custom text-sm mb-6">
                Enter your email and we'll send you a reset link.
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-custom mb-2">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-dark border border-dark-lighter rounded-lg focus:outline-none focus:border-primary text-white"
                    placeholder="you@example.com"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-primary hover:bg-primary-dark text-dark font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                  {loading ? 'Sending…' : 'Send Reset Link'}
                </button>
              </form>
              <p className="mt-6 text-center text-sm text-gray-custom">
                Remember your password?{' '}
                <Link to="/login" className="text-primary hover:text-primary-light">Sign In</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
