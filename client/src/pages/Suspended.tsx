import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../api/client';
import toast from 'react-hot-toast';
import { ShieldAlert, Clock, CheckCircle2, XCircle, LogOut } from 'lucide-react';

interface Appeal {
  id: string;
  kind: 'ACCOUNT_SUSPENSION' | 'CONTENT_REMOVAL';
  message: string;
  status: 'PENDING' | 'REVIEWING' | 'GRANTED' | 'DENIED';
  reviewNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

const STATUS_META: Record<Appeal['status'], { label: string; cls: string; icon: typeof Clock }> = {
  PENDING:   { label: 'Awaiting review', cls: 'text-yellow-300 bg-yellow-500/10 border-yellow-500/20', icon: Clock },
  REVIEWING: { label: 'Under review',    cls: 'text-primary bg-primary/10 border-primary/20',           icon: Clock },
  GRANTED:   { label: 'Approved',        cls: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20', icon: CheckCircle2 },
  DENIED:    { label: 'Not approved',    cls: 'text-red-300 bg-red-500/10 border-red-500/20',            icon: XCircle },
};

/**
 * Shown when the signed-in account is suspended. The user can authenticate but
 * is confined here — they can see why, submit ONE appeal, and track its status.
 * Everything on this page hits the allow-suspended /api/appeals routes.
 */
export default function Suspended() {
  const { suspension, logout } = useAuth();
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [reason, setReason] = useState<string | null>(suspension?.reason ?? null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    api.get('/appeals/mine')
      .then(({ data }) => {
        setAppeals(data.appeals ?? []);
        if (data.suspension?.suspensionReason) setReason(data.suspension.suspensionReason);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openAppeal = appeals.find((a) => a.kind === 'ACCOUNT_SUSPENSION' && (a.status === 'PENDING' || a.status === 'REVIEWING'));
  const lastResolved = appeals.find((a) => a.kind === 'ACCOUNT_SUSPENSION' && (a.status === 'GRANTED' || a.status === 'DENIED'));

  const submit = async () => {
    const text = message.trim();
    if (text.length < 10) { toast.error('Please explain your appeal in a little more detail'); return; }
    setSubmitting(true);
    try {
      await api.post('/appeals', { kind: 'ACCOUNT_SUSPENSION', message: text });
      setMessage('');
      toast.success('Appeal submitted — our team will review it');
      load();
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg ?? 'Could not submit your appeal');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="bg-card border border-line rounded-2xl overflow-hidden">
          {/* Header */}
          <div className="p-6 border-b border-line">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
                <ShieldAlert size={22} className="text-red-400" />
              </div>
              <div>
                <h1 className="text-lg font-bold">Your account is suspended</h1>
                <p className="text-sm text-gray-custom">Access is limited while this is in place.</p>
              </div>
            </div>
            {reason && (
              <div className="mt-4 rounded-lg bg-elevated border border-line p-3">
                <p className="text-xs text-gray-custom mb-0.5">Reason given</p>
                <p className="text-sm text-foreground">{reason}</p>
              </div>
            )}
          </div>

          {/* Appeal state */}
          <div className="p-6">
            {loading ? (
              <p className="text-sm text-gray-custom">Loading…</p>
            ) : openAppeal ? (
              <div>
                <StatusPill status={openAppeal.status} />
                <p className="text-sm text-gray-custom mt-3">
                  We've received your appeal and our team will review it. You'll regain access if it's approved.
                </p>
                <div className="mt-3 rounded-lg bg-elevated border border-line p-3">
                  <p className="text-xs text-gray-custom mb-1">Your appeal</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{openAppeal.message}</p>
                </div>
              </div>
            ) : (
              <div>
                {lastResolved?.status === 'DENIED' && (
                  <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3">
                    <p className="text-sm text-red-300">Your previous appeal wasn't approved.</p>
                    {lastResolved.reviewNote && <p className="text-xs text-red-300/80 mt-1">{lastResolved.reviewNote}</p>}
                    <p className="text-xs text-gray-custom mt-1">You can submit a new appeal with more detail.</p>
                  </div>
                )}
                <label className="text-sm font-medium">Appeal this decision</label>
                <p className="text-xs text-gray-custom mt-0.5 mb-2">Tell us why you think this was a mistake. Be specific — this goes to our moderation team.</p>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  maxLength={2000}
                  placeholder="Explain your appeal…"
                  className="w-full px-3 py-2.5 bg-elevated border border-line rounded-lg text-sm focus:outline-none focus:border-primary resize-none"
                />
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[11px] text-gray-custom">{message.trim().length}/2000</span>
                </div>
                <button
                  onClick={submit}
                  disabled={submitting || message.trim().length < 10}
                  className="mt-2 w-full py-2.5 bg-primary text-on-primary font-semibold text-sm rounded-lg disabled:opacity-50 hover:bg-primary-dark transition-colors"
                >
                  {submitting ? 'Submitting…' : 'Submit appeal'}
                </button>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-5 border-t border-line flex items-center justify-between">
            <p className="text-xs text-gray-custom">Need help? <a href="mailto:info@allfor1.pro" className="text-primary hover:underline">Contact us</a></p>
            <button onClick={logout} className="flex items-center gap-1.5 text-sm text-gray-custom hover:text-foreground transition-colors">
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: Appeal['status'] }) {
  const m = STATUS_META[status];
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${m.cls}`}>
      <Icon size={13} /> {m.label}
    </span>
  );
}
