import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../config/firebase';
import {
  sendPasswordResetEmail, EmailAuthProvider, reauthenticateWithCredential,
  PhoneAuthProvider, RecaptchaVerifier, linkWithCredential,
} from 'firebase/auth';
import { User, Lock, Trash2, Edit, Shield, Bell, LogOut, Bookmark, MessageSquare, Ban, Wifi, Phone, CheckCircle2, Circle, BadgeCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';

export default function Settings() {
  const { user, logout, unverifiedEmail } = useAuth();
  const navigate = useNavigate();
  const [sendingReset, setSendingReset] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [msgNotifs, setMsgNotifs] = useState<boolean | null>(null);
  const [onlineStatus, setOnlineStatus] = useState<boolean | null>(null);
  const [disableComments, setDisableComments] = useState<boolean | null>(null);
  const [blocked, setBlocked] = useState<any[]>([]);

  // Phone verification state
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [phoneSending, setPhoneSending] = useState(false);
  const [phoneVerifying, setPhoneVerifying] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [currentPhone, setCurrentPhone] = useState<string | null>(null);
  const recaptchaRef = useRef<HTMLDivElement>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);

  // Profile completeness state (for verification checklist)
  const [profileData, setProfileData] = useState<any>(null);

  useEffect(() => {
    if (!user?.id) return;
    api.get(`/users/${user.id}`).then(({ data }) => {
      const u = data?.user;
      if (!u) return;
      if (typeof u.messageNotifications === 'boolean') setMsgNotifs(u.messageNotifications);
      if (typeof u.showOnlineStatus === 'boolean') setOnlineStatus(u.showOnlineStatus);
      if (typeof u.disableAllComments === 'boolean') setDisableComments(u.disableAllComments);
      if (typeof u.phoneVerified === 'boolean') setPhoneVerified(u.phoneVerified);
      if (u.phone) setCurrentPhone(u.phone);
      setProfileData(u);
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
      // Server deletes the Prisma row AND the Firebase Auth record in one go,
      // so a closed tab mid-flow can't orphan either side.
      await api.delete('/users/account');
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

  // ── Phone verification handlers ──────────────────────────
  const sendOtp = async () => {
    if (!phoneNumber.trim() || !auth.currentUser) return;
    setPhoneSending(true);
    try {
      // Clean up any previous reCAPTCHA
      if (recaptchaVerifierRef.current) {
        recaptchaVerifierRef.current.clear();
        recaptchaVerifierRef.current = null;
      }
      const verifier = new RecaptchaVerifier(auth, recaptchaRef.current!, { size: 'invisible' });
      recaptchaVerifierRef.current = verifier;

      const provider = new PhoneAuthProvider(auth);
      const vId = await provider.verifyPhoneNumber(phoneNumber, verifier);
      setVerificationId(vId);
      toast.success('OTP sent! Check your phone.');
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/invalid-phone-number') {
        toast.error('Invalid phone number. Use format: +1234567890');
      } else if (err.code === 'auth/too-many-requests') {
        toast.error('Too many attempts. Try again later.');
      } else {
        toast.error('Failed to send OTP');
      }
    } finally {
      setPhoneSending(false);
    }
  };

  const verifyOtp = async () => {
    if (!otpCode.trim() || !verificationId || !auth.currentUser) return;
    setPhoneVerifying(true);
    try {
      const credential = PhoneAuthProvider.credential(verificationId, otpCode);
      await linkWithCredential(auth.currentUser, credential);
      // Tell server to mark phone as verified
      const { data } = await api.post('/users/settings/verify-phone');
      setPhoneVerified(true);
      setCurrentPhone(data.phone);
      setVerificationId(null);
      setOtpCode('');
      toast.success('Phone verified!');
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/invalid-verification-code') {
        toast.error('Incorrect code. Try again.');
      } else if (err.code === 'auth/provider-already-linked') {
        // Phone already linked — just confirm with server
        try {
          const { data } = await api.post('/users/settings/verify-phone');
          setPhoneVerified(true);
          setCurrentPhone(data.phone);
          setVerificationId(null);
          setOtpCode('');
          toast.success('Phone verified!');
        } catch {
          toast.error('Failed to verify phone');
        }
      } else {
        toast.error('Verification failed');
      }
    } finally {
      setPhoneVerifying(false);
    }
  };

  // ── Verification checklist ──────────────────────────────
  const emailVerified = !!(user && !unverifiedEmail);
  const isProfileComplete = !!(profileData?.name && profileData?.bio && profileData?.avatar && profileData?.location && profileData?.age && profileData?.position);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Verification Checklist — hidden for admins */}
      {user?.role !== 'ADMIN' && (
        <section className={`rounded-xl border p-5 ${user?.verified ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-dark-light border-dark-lighter'}`}>
          <h2 className="font-semibold flex items-center gap-2 mb-3">
            <BadgeCheck size={16} className={user?.verified ? 'text-emerald-400' : 'text-gray-custom'} />
            {user?.verified ? 'Verified Profile' : 'Get Verified'}
          </h2>
          {user?.verified ? (
            <p className="text-sm text-emerald-400/80">Your profile is fully verified. The verified badge is visible on your profile.</p>
          ) : (
            <>
              <p className="text-sm text-gray-custom mb-4">Complete all steps below to earn a verified badge on your profile.</p>
              <div className="space-y-2.5">
                <div className="flex items-center gap-3">
                  {emailVerified
                    ? <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                    : <Circle size={16} className="text-gray-custom shrink-0" />}
                  <span className={`text-sm ${emailVerified ? 'text-white' : 'text-gray-custom'}`}>Email verified</span>
                </div>
                <div className="flex items-center gap-3">
                  {phoneVerified
                    ? <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                    : <Circle size={16} className="text-gray-custom shrink-0" />}
                  <span className={`text-sm ${phoneVerified ? 'text-white' : 'text-gray-custom'}`}>Phone number verified</span>
                  {!phoneVerified && <span className="text-xs text-primary-light ml-auto">See below</span>}
                </div>
                <div className="flex items-center gap-3">
                  {isProfileComplete
                    ? <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                    : <Circle size={16} className="text-gray-custom shrink-0" />}
                  <span className={`text-sm ${isProfileComplete ? 'text-white' : 'text-gray-custom'}`}>Complete profile</span>
                  {!isProfileComplete && (
                    <Link to="/profile/edit" className="text-xs text-primary-light ml-auto hover:underline">Edit profile</Link>
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-custom mt-3">
                Required: name, bio, avatar, location, age, and position.
              </p>
            </>
          )}
        </section>
      )}

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

      {/* Phone Verification — hidden for admins */}
      {user?.role !== 'ADMIN' && <section className="bg-dark-light rounded-xl border border-dark-lighter p-5">
        <h2 className="font-semibold flex items-center gap-2 mb-4">
          <Phone size={16} className="text-primary-light" />
          Phone Verification
        </h2>
        {phoneVerified ? (
          <div className="flex items-center gap-3">
            <CheckCircle2 size={16} className="text-emerald-400" />
            <div>
              <p className="text-sm text-white font-medium">Phone verified</p>
              {currentPhone && <p className="text-xs text-gray-custom mt-0.5">{currentPhone}</p>}
            </div>
          </div>
        ) : !verificationId ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-custom">Enter your phone number with country code to receive a verification OTP.</p>
            <div className="flex gap-2">
              <input
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+1234567890"
                className="flex-1 bg-dark border border-dark-lighter rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-custom focus:outline-none focus:border-primary"
              />
              <button
                onClick={sendOtp}
                disabled={!phoneNumber.trim() || phoneSending}
                className="px-5 py-2.5 bg-primary hover:bg-primary-dark disabled:opacity-40 text-dark font-semibold rounded-lg transition-colors text-sm"
              >
                {phoneSending ? (
                  <div className="w-4 h-4 border-2 border-dark border-t-transparent rounded-full animate-spin" />
                ) : 'Send OTP'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-custom">Enter the 6-digit code sent to <span className="text-white font-medium">{phoneNumber}</span></p>
            <div className="flex gap-2">
              <input
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                className="flex-1 bg-dark border border-dark-lighter rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-custom focus:outline-none focus:border-primary text-center tracking-[0.3em] font-mono"
              />
              <button
                onClick={verifyOtp}
                disabled={otpCode.length < 6 || phoneVerifying}
                className="px-5 py-2.5 bg-primary hover:bg-primary-dark disabled:opacity-40 text-dark font-semibold rounded-lg transition-colors text-sm"
              >
                {phoneVerifying ? (
                  <div className="w-4 h-4 border-2 border-dark border-t-transparent rounded-full animate-spin" />
                ) : 'Verify'}
              </button>
            </div>
            <button
              onClick={() => { setVerificationId(null); setOtpCode(''); }}
              className="text-xs text-gray-custom hover:text-white transition-colors"
            >
              Change number
            </button>
          </div>
        )}
        {/* Invisible reCAPTCHA container */}
        <div ref={recaptchaRef} />
      </section>}

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
              <p className="font-medium capitalize">{user?.sport?.toLowerCase().replace(/_/g, ' ')}</p>
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
        <div className="p-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium flex items-center gap-2">
              <Shield size={14} className="text-primary-light" />
              Messages from connections only
            </p>
            <p className="text-xs text-gray-custom mt-0.5">Only your accepted connections can start a conversation with you</p>
          </div>
          <span className="text-[11px] font-medium text-emerald-400 bg-emerald-400/10 border border-emerald-400/30 rounded-full px-2.5 py-1">
            Always on
          </span>
        </div>
        <div className="p-5 flex items-center justify-between border-t border-dark-lighter">
          <div>
            <p className="text-sm font-medium flex items-center gap-2">
              <MessageSquare size={14} className="text-primary-light" />
              Disable comments on my posts
            </p>
            <p className="text-xs text-gray-custom mt-0.5">Prevent anyone from commenting on any of your posts</p>
          </div>
          <button
            onClick={async () => {
              const next = !disableComments;
              setDisableComments(next);
              try {
                await api.patch('/users/settings/notifications', { disableAllComments: next });
                toast.success(next ? 'Comments disabled on your posts' : 'Comments enabled on your posts');
              } catch {
                setDisableComments(!next);
                toast.error('Failed to update');
              }
            }}
            disabled={disableComments === null}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              disableComments ? 'bg-primary' : 'bg-dark-lighter'
            } disabled:opacity-50`}
            aria-pressed={!!disableComments}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                disableComments ? 'translate-x-5' : 'translate-x-0.5'
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
                  <p className="text-xs text-gray-custom capitalize">{u.role?.toLowerCase()} · {u.sport?.toLowerCase().replace(/_/g, ' ')}</p>
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
