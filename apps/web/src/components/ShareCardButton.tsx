import { useState } from 'react';
import toast from 'react-hot-toast';
import { Share2, Loader2 } from 'lucide-react';
import api from '../api/client';
import { track } from '../config/analytics';

/**
 * Share a server-rendered story card. Fetches the PNG from /api/share-cards/*
 * (self-only, always freshly rendered from the persisted stat tables) and hands
 * it to the native share sheet as a FILE, so Instagram / WhatsApp receive the
 * image itself; falls back to a download where file-sharing isn't supported.
 */
export default function ShareCardButton({
  path, filename, label = 'Share card', type, className,
}: {
  path: string;        // e.g. `/share-cards/match/${matchId}`
  filename: string;
  label?: string;
  type: string;        // analytics: 'match' | 'tournament' | 'career' | 'ranking' | 'profile'
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  const share = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      const res = await api.get(path, { responseType: 'blob' });
      const file = new File([res.data as Blob], filename, { type: 'image/png' });
      if (typeof navigator !== 'undefined' && 'canShare' in navigator && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
          track('share', { type: `card_${type}`, method: 'native' });
        } catch { /* user cancelled the sheet */ }
      } else {
        const url = URL.createObjectURL(res.data as Blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
        track('share', { type: `card_${type}`, method: 'download' });
      }
    } catch {
      toast.error('Could not build the card, no recorded data for it yet');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={share}
      disabled={busy}
      className={className ?? 'flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-dark-lighter text-gray-custom hover:text-primary hover:border-primary transition-colors disabled:opacity-50'}
      title="Share as a story card"
    >
      {busy ? <Loader2 size={13} className="animate-spin" /> : <Share2 size={13} />} {label}
    </button>
  );
}
