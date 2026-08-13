import { useState } from 'react';
import { Link2, Clock, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useInvalidateSocialCounts } from '../hooks/useInvalidateSocialCounts';

type St = 'idle' | 'requested' | 'connected';

// The server's relationship state (from discovery/list endpoints) → button state.
// pending_in (they requested us) maps to idle: pressing Connect auto-accepts it.
function stateFromStatus(status?: string): St {
  if (status === 'connected') return 'connected';
  if (status === 'pending_out') return 'requested';
  return 'idle';
}

/**
 * Compact Connect action for discovery surfaces (feed rail, suggestions, Explore,
 * Radar) — anywhere Follow appears. Connection is mutual and unlocks messaging,
 * distinct from Follow. Self-contained: sends the request, reflects the result
 * optimistically, and resolves the "already connected / already sent" races the
 * list endpoints can't tell it about up front. Stops propagation so it works
 * inside a card that links to the profile.
 */
export default function ConnectButton({
  userId, className = '', status,
}: { userId: string; className?: string; status?: string }) {
  const [st, setSt] = useState<St>(stateFromStatus(status));
  const [busy, setBusy] = useState(false);
  const invalidateSocial = useInvalidateSocialCounts();

  const send = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (st !== 'idle' || busy) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/connections/request/${userId}`);
      const connected = !!data?.autoAccepted;
      setSt(connected ? 'connected' : 'requested');
      toast.success(connected ? 'Connected!' : 'Request sent');
    } catch (err: any) {
      const msg: string = err?.response?.data?.error || '';
      if (/already connected/i.test(msg)) setSt('connected');
      else if (/already sent/i.test(msg)) setSt('requested');
      else toast.error(msg || 'Could not send request');
    } finally {
      setBusy(false);
      // Refresh counts everywhere — an auto-accept (or a discovered
      // already-connected state) moves connection totals on other surfaces.
      invalidateSocial();
    }
  };

  const base = `inline-flex items-center gap-1 rounded-full text-[11px] font-semibold transition-colors ${className}`;
  if (st === 'connected') {
    return <span className={`${base} px-2.5 py-1 bg-elevated text-gray-custom`}><Check size={12} /> Connected</span>;
  }
  if (st === 'requested') {
    return <span className={`${base} px-2.5 py-1 bg-elevated text-gray-custom`}><Clock size={12} /> Requested</span>;
  }
  return (
    <button onClick={send} disabled={busy}
      className={`${base} px-2.5 py-1 border border-primary/30 bg-primary/10 text-primary-light hover:bg-primary/20 disabled:opacity-50`}>
      <Link2 size={12} /> Connect
    </button>
  );
}
