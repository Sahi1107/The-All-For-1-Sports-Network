import { useEffect, useState } from 'react';
import { X, Download, Share } from 'lucide-react';
import { track } from '../config/analytics';

// "Add to Home Screen" prompt. Deliberately not shown on the first visit — it
// waits until the 2nd (so we ask once someone's shown a little intent), and once
// dismissed or installed it never nags again.
const DISMISS_KEY = 'af1_a2hs_dismissed';
const VISIT_KEY = 'af1_visits';

type BIPEvent = Event & { prompt: () => void; userChoice: Promise<{ outcome: string }> };

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    try {
      if (isStandalone() || localStorage.getItem(DISMISS_KEY)) return;
      const visits = Number(localStorage.getItem(VISIT_KEY) || '0') + 1;
      localStorage.setItem(VISIT_KEY, String(visits));

      const onBIP = (e: Event) => {
        e.preventDefault();
        setDeferred(e as BIPEvent);
        if (visits >= 2) setShow(true);
      };
      window.addEventListener('beforeinstallprompt', onBIP);

      // iOS Safari never fires beforeinstallprompt → show an instructional hint.
      if (isIOS() && !isStandalone() && visits >= 2) { setIos(true); setShow(true); }

      return () => window.removeEventListener('beforeinstallprompt', onBIP);
    } catch { /* storage unavailable */ }
  }, []);

  const close = (installed?: boolean) => {
    setShow(false);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
    if (!installed) track('a2hs_dismissed');
  };

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    try { const { outcome } = await deferred.userChoice; track('a2hs_prompt', { outcome }); } catch { /* ignore */ }
    setDeferred(null);
    close(true);
  };

  if (!show) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[55] p-3 sm:p-4 pointer-events-none"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto max-w-md bg-card border border-line rounded-2xl shadow-lg p-4 flex items-center gap-3 pointer-events-auto">
        <img src="/icons/icon-192.png" alt="" className="w-11 h-11 rounded-xl shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Install All For 1</p>
          {ios ? (
            <p className="text-xs text-gray-custom mt-0.5 flex items-center gap-1">
              Tap <Share size={12} className="inline" /> then “Add to Home Screen”
            </p>
          ) : (
            <p className="text-xs text-gray-custom mt-0.5">Add it to your home screen for the full app.</p>
          )}
        </div>
        {!ios && (
          <button onClick={install} className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-primary-dark text-on-primary text-sm font-semibold rounded-lg transition-colors">
            <Download size={14} /> Install
          </button>
        )}
        <button onClick={() => close()} aria-label="Dismiss" className="shrink-0 text-gray-custom hover:text-foreground transition-colors">
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
