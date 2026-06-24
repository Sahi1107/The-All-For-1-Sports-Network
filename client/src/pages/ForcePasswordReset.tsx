import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { auth } from '../config/firebase';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import toast from 'react-hot-toast';
import { Lock, LogOut } from 'lucide-react';

// Mirrors the server-side complexity policy.
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

/**
 * Forced first-login password change for accounts created by admin
 * bulk-provisioning (which sets `mustResetPassword`). The user signs in with the
 * temp password they were emailed, then must set a new one here before reaching
 * the rest of the app.
 */
export default function ForcePasswordReset() {
  const { user, updateUser, logout } = useAuth();
  const [tempPassword, setTempPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // If the flag isn't set, there's nothing to do here.
  if (user && !user.mustResetPassword) return <Navigate to="/home" replace />;
  if (!user) return <Navigate to="/" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!auth.currentUser || !user) return;

    if (!PASSWORD_REGEX.test(newPassword)) {
      toast.error('New password must be 8+ characters with an uppercase letter, a lowercase letter, and a number');
      return;
    }
    if (newPassword !== confirm) {
      toast.error('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      // Re-authenticate with the temp password, then set the new one in Firebase.
      const credential = EmailAuthProvider.credential(user.email, tempPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPassword);

      // Clear the server-side flag, then update local state so the gate lifts.
      await api.post('/auth/password-changed', {});
      updateUser({ ...user, mustResetPassword: false });
      toast.success('Password updated — welcome to All For 1!');
    } catch (err: any) {
      const code = err?.code as string | undefined;
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        toast.error('That temporary password is incorrect');
      } else {
        toast.error('Could not update password. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-md bg-card rounded-xl border border-line p-6">
        <div className="flex items-center gap-2 mb-1">
          <Lock size={18} className="text-primary-light" />
          <h1 className="text-lg font-bold">Set a new password</h1>
        </div>
        <p className="text-sm text-gray-custom mb-6">
          Your account was created by an organizer with a temporary password. Choose a new one to continue.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-custom mb-1">Temporary password (from your welcome email)</label>
            <input
              type="password"
              value={tempPassword}
              onChange={(e) => setTempPassword(e.target.value)}
              required
              className="w-full px-4 py-2.5 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-custom mb-1">New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              className="w-full px-4 py-2.5 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-custom mb-1">Confirm new password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              className="w-full px-4 py-2.5 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full px-5 py-2.5 bg-primary hover:bg-primary-dark text-on-primary font-semibold rounded-lg text-sm disabled:opacity-50"
          >
            {submitting ? 'Updating…' : 'Set password & continue'}
          </button>
        </form>

        <button
          onClick={() => logout()}
          className="mt-4 w-full text-xs text-gray-custom hover:text-foreground flex items-center justify-center gap-1.5"
        >
          <LogOut size={12} /> Sign out
        </button>
      </div>
    </div>
  );
}
