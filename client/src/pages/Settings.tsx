import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../config/firebase';
import { sendPasswordResetEmail, deleteUser, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { User, Lock, Trash2, Edit, Shield, Bell, LogOut, Bookmark } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';

export default function Settings() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sendingReset, setSendingReset] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleChangePassword = async () => {
    if (!user?.email) return;
    setSendingReset(true);
    try {
      await sendPasswordResetEmail(auth, user.email);
      toast.success('Password reset email sent — check your inbox');
    } catch {
      toast.error('Failed to send reset email');
    } finally {
      setSendingReset(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!auth.currentUser || !user?.email) return;
    setDeleting(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, deletePassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await api.delete('/users/account');
      await deleteUser(auth.currentUser);
      await logout();
      navigate('/login');
      toast.success('Account deleted');
    } catch (err: any) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        toast.error('Incorrect password');
      } else {
        toast.error('Failed to delete account');
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Account */}
      <section className="bg-dark-light rounded-xl border border-dark-lighter divide-y divide-dark-lighter">
        <div className="p-5">
          <h2 className="font-semibold flex items-center gap-2 mb-4">
            <User size={16} className="text-primary-light" />
            Account
          </h2>
          <div className="space-y-1 text-sm text-gray-custom">
            <p>Email</p>
            <p className="text-white font-medium">{user?.email}</p>
          </div>
        </div>

        <div className="p-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Edit Profile</p>
            <p className="text-xs text-gray-custom mt-0.5">Update your name, bio, position and more</p>
          </div>
          <Link
            to="/profile/edit"
            className="flex items-center gap-2 px-4 py-2 bg-dark-lighter hover:bg-dark border border-dark-lighter text-sm rounded-lg transition-colors"
          >
            <Edit size={14} />
            Edit
          </Link>
        </div>

        <div className="p-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium flex items-center gap-2">
              <Bookmark size={14} className="text-yellow-400" />
              Saved Posts
            </p>
            <p className="text-xs text-gray-custom mt-0.5">View posts you've bookmarked</p>
          </div>
          <Link
            to="/saved"
            className="flex items-center gap-2 px-4 py-2 bg-dark-lighter hover:bg-dark border border-dark-lighter text-sm rounded-lg transition-colors"
          >
            <Bookmark size={14} />
            View
          </Link>
        </div>

        <div className="p-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium flex items-center gap-2">
              <Lock size={14} className="text-gray-custom" />
              Change Password
            </p>
            <p className="text-xs text-gray-custom mt-0.5">We'll send a reset link to your email</p>
          </div>
          <button
            onClick={handleChangePassword}
            disabled={sendingReset}
            className="px-4 py-2 bg-dark-lighter hover:bg-dark border border-dark-lighter text-sm rounded-lg transition-colors disabled:opacity-50"
          >
            {sendingReset ? 'Sending…' : 'Send Reset Email'}
          </button>
        </div>
      </section>

      {/* Role & Sport */}
      <section className="bg-dark-light rounded-xl border border-dark-lighter p-5">
        <h2 className="font-semibold flex items-center gap-2 mb-4">
          <Shield size={16} className="text-accent" />
          {user?.role === 'ADMIN' ? 'Role' : 'Role & Sport'}
        </h2>
        <div className={`grid gap-4 text-sm ${user?.role === 'ADMIN' ? 'grid-cols-1' : 'grid-cols-2'}`}>
          <div className="bg-dark rounded-lg p-3">
            <p className="text-gray-custom text-xs mb-1">Role</p>
            <p className="font-medium capitalize">{user?.role?.toLowerCase()}</p>
          </div>
          {user?.role !== 'ADMIN' && (
            <div className="bg-dark rounded-lg p-3">
              <p className="text-gray-custom text-xs mb-1">Sport</p>
              <p className="font-medium capitalize">{user?.sport?.toLowerCase()}</p>
            </div>
          )}
        </div>
        <p className="text-xs text-gray-custom mt-3">
          {user?.role === 'ADMIN' ? 'Role cannot be changed.' : 'Role and sport cannot be changed once selected.'}
        </p>
      </section>

      {/* Notifications placeholder */}
      <section className="bg-dark-light rounded-xl border border-dark-lighter p-5">
        <h2 className="font-semibold flex items-center gap-2 mb-1">
          <Bell size={16} className="text-secondary" />
          Notifications
        </h2>
        <p className="text-sm text-gray-custom">You receive notifications for follows, connections, tournament updates and messages.</p>
      </section>

      {/* Sign out */}
      <section className="bg-dark-light rounded-xl border border-dark-lighter p-5 flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Sign Out</p>
          <p className="text-xs text-gray-custom mt-0.5">Sign out of your account on this device</p>
        </div>
        <button
          onClick={async () => { await logout(); navigate('/login'); }}
          className="flex items-center gap-2 px-4 py-2 bg-dark-lighter hover:bg-dark border border-dark-lighter text-sm rounded-lg transition-colors"
        >
          <LogOut size={14} />
          Sign Out
        </button>
      </section>

      {/* Danger Zone */}
      <section className="bg-dark-light rounded-xl border border-red-500/20 p-5">
        <h2 className="font-semibold text-red-400 flex items-center gap-2 mb-4">
          <Trash2 size={16} />
          Danger Zone
        </h2>
        {!showDeleteConfirm ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Delete Account</p>
              <p className="text-xs text-gray-custom mt-0.5">Permanently delete your account and all data</p>
            </div>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-sm rounded-lg transition-colors"
            >
              Delete Account
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-red-300">Enter your password to confirm account deletion. This cannot be undone.</p>
            <input
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="Your password"
              className="w-full bg-dark border border-red-500/30 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-custom focus:outline-none focus:border-red-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); }}
                className="flex-1 py-2 bg-dark-lighter hover:bg-dark border border-dark-lighter text-sm rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={!deletePassword || deleting}
                className="flex-1 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-400 text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
