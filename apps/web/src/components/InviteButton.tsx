import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import { track } from '../config/analytics';

/**
 * Creates a contextual invite (e.g. "join my team") and shares it. The invited
 * person lands on /join/:code showing who invited them + what they're joining,
 * and the signup is attributed back.
 */
export default function InviteButton({
  kind, teamId, tournamentId, title, label = 'Invite',
}: { kind: 'TEAMMATE' | 'COACH' | 'ATHLETE' | 'TOURNAMENT'; teamId?: string; tournamentId?: string; title: string; label?: string }) {
  const [loading, setLoading] = useState(false);

  const go = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/invite', { kind, ...(teamId && { teamId }), ...(tournamentId && { tournamentId }) });
      track('invite_created', { kind });
      const url: string = data.url;
      const nav = navigator as Navigator;
      if (typeof nav.share === 'function') {
        try { await nav.share({ title, url }); } catch { /* cancelled */ }
      } else {
        await navigator.clipboard.writeText(url);
        toast.success('Invite link copied — share it with them');
      }
    } catch {
      toast.error('Could not create invite link');
    } finally { setLoading(false); }
  };

  return (
    <button
      onClick={go}
      disabled={loading}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-elevated hover:bg-surface border border-line text-xs font-medium rounded-lg transition-colors disabled:opacity-50 shrink-0"
    >
      <UserPlus size={14} /> {loading ? '…' : label}
    </button>
  );
}
