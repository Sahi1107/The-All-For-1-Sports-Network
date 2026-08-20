import { useState } from 'react';
import toast from 'react-hot-toast';
import { Share2, Loader2 } from 'lucide-react';
import api from '../api/client';
import { track } from '../config/analytics';

/**
 * Share a server-rendered story card. Fetches the PNG from /api/share-cards/*
 * (self-only, always freshly rendered from the persisted stat tables) and hands
 * it to the native share sheet as a FILE, so Instagram / WhatsApp receive the
 * image itself; falls back to a download where file-sharing isn't available.
 */

/** Save the blob as a file — the fallback whenever the share sheet can't run. */
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function ShareCardButton({
  path, filename, label = 'Share card', type, className, onDone,
}: {
  path: string;        // e.g. `/share-cards/match/${matchId}`
  filename: string;
  label?: string;
  type: string;        // analytics: 'match' | 'tournament' | 'career' | 'ranking' | 'profile'
  className?: string;
  onDone?: () => void; // called once the flow finishes (e.g. to close a menu)
}) {
  const [busy, setBusy] = useState(false);

  const share = async (e: React.MouseEvent) => {
    // Stop the click here: this button often sits inside a dropdown that
    // unmounts on click, which would kill the request mid-flight. The parent
    // closes itself via onDone() when the flow is actually finished.
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      const res = await api.get(path, { responseType: 'blob' });
      const blob = res.data as Blob;
      const file = new File([blob], filename, { type: 'image/png' });

      if (typeof navigator !== 'undefined' && 'canShare' in navigator && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
          track('share', { type: `card_${type}`, method: 'native' });
        } catch (err) {
          // Only a real cancel is silent. Everything else (notably
          // NotAllowedError, when the tap's transient activation expired while
          // the card was rendering) must still hand the athlete their card —
          // otherwise the button just does nothing, intermittently, by latency.
          if ((err as DOMException)?.name === 'AbortError') return;
          download(blob, filename);
          track('share', { type: `card_${type}`, method: 'download_fallback' });
        }
      } else {
        download(blob, filename);
        track('share', { type: `card_${type}`, method: 'download' });
      }
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 403) toast.error("Story cards aren't available for this account");
      else if (status === 404) toast.error('No recorded data to build this card from yet');
      else toast.error('Could not build the card, please try again');
    } finally {
      setBusy(false);
      onDone?.();
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
