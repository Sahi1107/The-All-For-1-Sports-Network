import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { confirmPasswordReset } from 'firebase/auth';
import { auth } from '../config/firebase';
import toast from 'react-hot-toast';
import logoUrl from '../assets/logo.svg';

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [loading, setLoading]   = useState(false);

  // Firebase puts the one-time code in ?oobCode=
  const oobCode = searchParams.get('oobCode') ?? '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!PASSWORD_REGEX.test(password)) {
      toast.error('Password must be 8+ characters with uppercase, lowercase, and a number.');
      return;
    }
    if (password !== confirm) {
      toast.error('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await confirmPasswordReset(auth, oobCode, password);
      toast.success('Password reset successfully!');
      navigate('/login');
    } catch (err: any) {
      const code = err.code ?? '';
      if (code === 'auth/expired-action-code' || code === 'auth/invalid-action-code') {
        toast.error('Reset link has expired or already been used. Request a new one.');
      } else {
        toast.error('Reset failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!oobCode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark p-4">
        <div className="w-full max-w-md text-center bg-dark-light rounded-2xl p-8 border border-dark-lighter">
          <p className="text-red-400 mb-4">Invalid or missing reset link.</p>
          <Link to="/forgot-password" className="text-primary hover:text-primary-light">
            Request a new reset link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src={logoUrl} alt="All For 1" className="h-20 mx-auto mb-4" />
        </div>

        <form onSubmit={handleSubmit} className="bg-dark-light rounded-2xl p-8 border border-dark-lighter">
          <h2 className="text-xl font-semibold mb-2">Reset Password</h2>
          <p className="text-gray-custom text-sm mb-6">Enter your new password below.</p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-custom mb-2">New Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 bg-dark border border-dark-lighter rounded-lg focus:outline-none focus:border-primary text-white"
                placeholder="Min 8 chars, upper + lower + number"
              />
              {password && !PASSWORD_REGEX.test(password) && (
                <p className="text-xs text-red-400 mt-1">
                  Must be 8+ characters with an uppercase letter, lowercase letter, and number.
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm text-gray-custom mb-2">Confirm Password</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                className="w-full px-4 py-3 bg-dark border border-dark-lighter rounded-lg focus:outline-none focus:border-primary text-white"
                placeholder="Repeat your password"
              />
              {confirm && password !== confirm && (
                <p className="text-xs text-red-400 mt-1">Passwords do not match.</p>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !PASSWORD_REGEX.test(password) || password !== confirm}
            className="w-full mt-6 py-3 bg-primary hover:bg-primary-dark text-dark font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Resetting…' : 'Reset Password'}
          </button>

          <p className="mt-6 text-center text-sm text-gray-custom">
            <Link to="/login" className="text-primary hover:text-primary-light">Back to Sign In</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
