import { useEffect } from 'react';
import { X } from 'lucide-react';
import SearchTypeahead from './SearchTypeahead';

/**
 * The feed typeahead, promoted to app chrome: an overlay reachable from every
 * page (triggered by the header/rail search icon). Same component, same privacy
 * gate. Closes on Escape, backdrop tap, or when a result navigates.
 */
export default function GlobalSearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; // don't let the page scroll behind it
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow; };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="Search">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative mx-auto w-full max-w-xl px-4"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 14px)' }}
      >
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <SearchTypeahead autoFocus onNavigate={onClose} className="w-full" />
          </div>
          <button
            onClick={onClose}
            aria-label="Close search"
            className="shrink-0 w-[42px] h-[42px] rounded-full bg-surface border border-ink/10 flex items-center justify-center text-gray-custom hover:text-foreground transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
