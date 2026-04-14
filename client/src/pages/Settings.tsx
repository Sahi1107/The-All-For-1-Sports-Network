import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../config/firebase';
import { sendPasswordResetEmail, deleteUser, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { User, Lock, Trash2, Edit, Shield, Bell, LogOut, Bookmark, MessageSquare, Ban, Wifi } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';

export default function Settings() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sendingReset, setSendingReset] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [msgNotifs, setMsgNotifs] = useState<boolean | null>(null);
  const [onlineStatus, setOnlineStatus] = useState<boolean | null>(null);
  const [blocked, setBlocked] = useState<any[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    api.get(`/users/${user.id}`).then(({ data }) => {
      if (typeof data?.user?.messageNotifications === 'boolean') {
        setMsgNotifs(data.user.messageNotifications);
      }
      if (typeof data?.user?.showOnlineStatus === 'boolean') {
        setOnlineStatus(data.user.showOnlineStatus);
      }
    }).catch(() => {});
    api.get('/users/blocked').then(({ data }) => setBlocked(data.users ?? [])).catch(() => {});
  }, [user?.id]);

  const toggleMsgNotifs = async (next: boolean) => {
    setMsgNotifs(next);
    try {
      await api.patch('/users/settings/notifications', { messageNotifications: next });
      toast.success(next ? 'Message notifications enabled' : 'Message notifications disabled');
    } catch {
      setMsgNotifs(!next);
      toast.error('Failed to update');
    }
  };

  const unblock = async (userId: string) => {
    try {
      await api.delete(`/users/block/${userId}`);
      setBlocked((prev) => prev.filter((u) => u.id !== userId));
      toast.success('User unblocked');
    } catch {
      toast.error('Failed to unblock');
    }
  };

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

      {/* Notifications */}
      <section className="bg-dark-light rounded-xl border border-dark-lighter divide-y divide-dark-lighter">
        <div className="p-5">
          <h2 className="font-semibold flex items-center gap-2 mb-1">
            <Bell size={16} className="text-secondary" />
            Notifications
          </h2>
          <p className="text-sm text-gray-custom">You receive notifications for follows, connections, tournament updates and messages.</p>
        </div>
        <div className="p-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium flex items-center gap-2">
              <MessageSquare size={14} className="text-primary-light" />
              Message notifications
            </p>
            <p className="text-xs text-gray-custom mt-0.5">Get notified when someone sends you a direct message</p>
          </div>
          <button
            onClick={() => toggleMsgNotifs(!msgNotifs)}
            disabled={msgNotifs === null}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              msgNotifs ? 'bg-primary' : 'bg-dark-lighter'
            } disabled:opacity-50`}
            aria-pressed={!!msgNotifs}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                msgNotifs ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
        <div className="p-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium flex items-center gap-2">
              <Wifi size={14} className="text-emerald-400" />
              Online Status
            </p>
            <p className="text-xs text-gray-custom mt-0.5">Show when you're active on the platform</p>
          </div>
          <button
            onClick={async () => {
              const next = !onlineStatus;
              setOnlineStatus(next);
              try {
                await api.patch('/users/settings/notifications', { showOnlineStatus: next });
                toast.success(next ? 'Online status visible' : 'Online status hidden');
              } catch {
                setOnlineStatus(!next);
                toast.error('Failed to update');
              }
            }}
            disabled={onlineStatus === null}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              onlineStatus ? 'bg-emerald-500' : 'bg-dark-lighter'
            } disabled:opacity-50`}
            aria-pressed={!!onlineStatus}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                onlineStatus ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </section>

      {/* Blocked accounts */}
      <section className="bg-dark-light rounded-xl border border-dark-lighter p-5">
        <h2 className="font-semibold flex items-center gap-2 mb-3">
          <Ban size={16} className="text-red-400" />
          Blocked Accounts
        </h2>
        {blocked.length === 0 ? (
          <p className="text-sm text-gray-custom">You haven't blocked anyone.</p>
        ) : (
          <div className="space-y-2">
            {blocked.map((u) => (
              <div key={u.id} className="flex items-center gap-3 p-2 rounded-lg bg-dark border border-dark-lighter">
                {u.avatar ? (
                  <img src={u.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary-light">
                    {u.name?.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{u.name}</p>
                  <p className="text-xs text-gray-custom capitalize">{u.role?.toLowerCase()} · {u.sport?.toLowerCase()}</p>
                </div>
                <button
                  onClick={() => unblock(u.id)}
                  className="px-3 py-1.5 text-xs bg-dark-lighter hover:bg-dark border border-dark-lighter rounded-lg transition-colors"
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        )}
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
