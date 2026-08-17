import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { POLICY_EFFECTIVE_DATE } from '@af1/core';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';

/**
 * Notify-and-acknowledge, not a hard gate. When the signed-in user hasn't accepted
 * the current Terms/Privacy version (server returns acceptedCurrentPolicy === false),
 * a non-blocking banner tells them what changed and records their acknowledgement
 * via POST /auth/accept-policy. They can keep using the app either way; this just
 * captures a versioned acceptance and stops prompting.
 */
export default function PolicyUpdatePrompt() {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [saving, setSaving] = useState(false);

  // Only when the server explicitly says "not accepted" (false, not undefined).
  if (!user || user.acceptedCurrentPolicy !== false || dismissed) return null;

  const acknowledge = async () => {
    setSaving(true);
    try {
      await api.post('/auth/accept-policy');
      setDismissed(true);
    } catch {
      /* keep the prompt up so they can retry */
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Updated Terms and Privacy Policy"
      className="fixed inset-x-0 bottom-0 z-[90] p-3 sm:p-4 flex justify-center pointer-events-none"
    >
      <div className="pointer-events-auto w-full max-w-2xl bg-card border border-line rounded-xl shadow-xl p-4 sm:flex sm:items-center sm:gap-4">
        <ShieldCheck size={20} className="text-primary-light shrink-0 hidden sm:block" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-foreground font-medium">We’ve updated our Terms &amp; Privacy Policy</p>
          <p className="text-xs text-foreground/60 mt-0.5">
            Effective {POLICY_EFFECTIVE_DATE}. In short: we do not sell your personal data, and protections for
            under-18 athletes are strengthened. Read the{' '}
            <Link to="/terms" className="text-primary-light underline">Terms</Link> and{' '}
            <Link to="/privacy" className="text-primary-light underline">Privacy Policy</Link>.
          </p>
        </div>
        <div className="flex items-center gap-2 mt-3 sm:mt-0 shrink-0">
          <Link
            to="/privacy"
            className="px-3 py-2 text-sm font-medium text-foreground rounded-lg border border-line hover:bg-elevated transition-colors"
          >
            Review
          </Link>
          <button
            onClick={acknowledge}
            disabled={saving}
            className="px-4 py-2 text-sm font-semibold bg-primary text-on-primary rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'I acknowledge'}
          </button>
        </div>
      </div>
    </div>
  );
}
