import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserPlus, Copy, Check, Share2, MessageCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/client';
import BallLoader from '../components/BallLoader';
import { track } from '../config/analytics';

export default function Invite() {
  const { data, isLoading } = useQuery<{ code: string; url: string }>({
    queryKey: ['invite-link'],
    queryFn: async () => (await api.get('/invite/link')).data,
  });
  const [copied, setCopied] = useState(false);
  const url = data?.url ?? '';
  const shareText = 'Join me on All For 1 — where athletes get seen. Verified stats, tournaments, and scouts who find you.';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true); setTimeout(() => setCopied(false), 1800);
      toast.success('Invite link copied');
      track('invite_link_copied', { method: 'copy' });
    } catch { toast.error('Could not copy link'); }
  };

  const nativeShare = async () => {
    const nav = navigator as Navigator;
    if (typeof nav.share === 'function') {
      try { await nav.share({ title: 'All For 1', text: shareText, url }); track('invite_link_copied', { method: 'native' }); } catch { /* cancelled */ }
    } else { copy(); }
  };

  const whatsapp = () => {
    track('invite_link_copied', { method: 'whatsapp' });
    window.open(`https://wa.me/?text=${encodeURIComponent(`${shareText}\n${url}`)}`, '_blank');
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center gap-2 mb-1">
        <UserPlus size={22} className="text-primary" />
        <h1 className="text-2xl font-bold">Invite to All For 1</h1>
      </div>
      <p className="text-gray-custom text-sm mb-6">Share your link. Anyone who joins through it is connected to you — and we’ll know you brought them in.</p>

      <section className="bg-card rounded-2xl border border-line p-6">
        <p className="text-sm font-medium mb-3">Your personal invite link</p>
        {isLoading ? (
          <div className="flex justify-center py-6"><BallLoader /></div>
        ) : (
          <>
            <div className="flex items-stretch gap-2">
              <div className="flex-1 min-w-0 bg-surface border border-line rounded-lg px-4 py-3 text-sm text-foreground/90 truncate font-mono">{url}</div>
              <button onClick={copy} className="shrink-0 flex items-center gap-2 px-4 py-3 bg-primary hover:bg-primary-dark text-on-primary text-sm font-semibold rounded-lg transition-colors">
                {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy'}
              </button>
            </div>

            <div className="flex gap-2 mt-3">
              <button onClick={whatsapp} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-elevated hover:bg-surface border border-line text-sm rounded-lg transition-colors">
                <MessageCircle size={15} className="text-green-400" /> WhatsApp
              </button>
              <button onClick={nativeShare} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-elevated hover:bg-surface border border-line text-sm rounded-lg transition-colors">
                <Share2 size={15} /> Share
              </button>
            </div>
          </>
        )}
      </section>

      <section className="bg-card rounded-2xl border border-line p-6 mt-5">
        <p className="text-sm font-medium mb-3">Where invites work best</p>
        <ul className="space-y-3 text-sm text-gray-custom">
          <li className="flex gap-3"><span className="text-primary">•</span> <span><span className="text-foreground font-medium">Teammates</span> — invite them straight from your team page so they land on “join [your team]”.</span></li>
          <li className="flex gap-3"><span className="text-primary">•</span> <span><span className="text-foreground font-medium">A coach or scout</span> you know — send your link so they can find your profile and stats.</span></li>
          <li className="flex gap-3"><span className="text-primary">•</span> <span><span className="text-foreground font-medium">Another athlete</span> — bring a friend who deserves to get seen.</span></li>
        </ul>
      </section>
    </div>
  );
}
