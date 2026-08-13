import { useEffect, useRef, useState } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

/**
 * Unobtrusive connection status. Shows a small pill (bottom-centre, above the
 * mobile tab bar) only when the connection has been down long enough to matter,
 * and a brief "Back online" confirmation on recovery. No persistent red banner
 * — a 2-second blip shows nothing at all.
 */
export default function OfflineIndicator() {
  const { online, showOffline } = useOnlineStatus();
  const [reconnected, setReconnected] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    if (showOffline) wasOffline.current = true;
    if (online && wasOffline.current) {
      wasOffline.current = false;
      setReconnected(true);
      const t = setTimeout(() => setReconnected(false), 2500);
      return () => clearTimeout(t);
    }
  }, [online, showOffline]);

  if (!showOffline && !reconnected) return null;

  const offline = showOffline;
  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[80] pointer-events-none"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 5rem)' }}
      role="status"
      aria-live="polite"
    >
      <div
        className={`flex items-center gap-2 px-3.5 py-2 rounded-full text-xs font-semibold shadow-lg border backdrop-blur-md af-fade-in ${
          offline
            ? 'bg-surface/90 border-ink/15 text-foreground'
            : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
        }`}
      >
        {offline ? <WifiOff size={14} className="text-gray-custom" /> : <Wifi size={14} />}
        {offline ? "You're offline — showing saved content" : 'Back online'}
      </div>
    </div>
  );
}
