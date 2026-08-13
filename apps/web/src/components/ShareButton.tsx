import { Share2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { track } from '../config/analytics';

/**
 * Shares a rich-preview link. `path` is the /s/... share route (which serves the
 * per-entity OG card to crawlers and redirects humans to the real page).
 */
export default function ShareButton({ path, title, type, label = 'Share' }: { path: string; title: string; type: string; label?: string }) {
  const share = async () => {
    const url = `${window.location.origin}${path}`;
    const nav = navigator as Navigator;
    if (typeof nav.share === 'function') {
      try { await nav.share({ title, url }); track('share', { type, method: 'native' }); } catch { /* cancelled */ }
      return;
    }
    try {
      await nav.clipboard.writeText(url);
      toast.success('Link copied');
      track('share', { type, method: 'copy' });
    } catch { toast.error('Could not copy link'); }
  };

  return (
    <button
      onClick={share}
      title="Share"
      className="flex items-center gap-1.5 px-3 py-1.5 bg-elevated hover:bg-surface border border-line text-xs font-medium rounded-lg transition-colors shrink-0"
    >
      <Share2 size={14} /> {label}
    </button>
  );
}
