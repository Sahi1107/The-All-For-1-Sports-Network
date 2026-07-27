import { useEffect, useState } from 'react';

/**
 * Online/offline state with a deliberate asymmetry so it's never annoying:
 *   • `online` flips immediately (used to gate requests).
 *   • `showOffline` only becomes true after the connection has been down for
 *     `offlineDelay` ms — so a brief blip (the constant on Indian mobile data)
 *     never flashes an indicator. It clears instantly on reconnect.
 */
export function useOnlineStatus(offlineDelay = 2500): { online: boolean; showOffline: boolean } {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [showOffline, setShowOffline] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const goOnline = () => { if (timer) clearTimeout(timer); setOnline(true); setShowOffline(false); };
    const goOffline = () => {
      setOnline(false);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setShowOffline(true), offlineDelay); // only surface a sustained outage
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    if (typeof navigator !== 'undefined' && !navigator.onLine) goOffline();
    return () => { if (timer) clearTimeout(timer); window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, [offlineDelay]);

  return { online, showOffline };
}
