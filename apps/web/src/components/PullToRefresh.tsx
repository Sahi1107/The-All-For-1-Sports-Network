import { useEffect, useRef, useState, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

const THRESHOLD = 68;  // pull distance (post-resistance) needed to trigger
const MAX = 100;       // clamp so it can't be dragged arbitrarily far
const RESISTANCE = 0.5;

/**
 * Native-feeling pull-to-refresh for touch devices. The page scrolls on the
 * window, so we listen on the document and only engage when:
 *   • it's a coarse pointer (touch), and
 *   • the window is scrolled to the very top, and
 *   • the gesture is a downward pull, and
 *   • no modal has locked body scroll.
 * Content follows the finger via a GPU transform; native scroll is only
 * preventDefault-ed once we've actually engaged, so normal scrolling is never
 * hijacked. In a standalone PWA (where the browser's own PTR is gone) this
 * restores the expected gesture.
 */
export default function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<unknown> | unknown; children: ReactNode }) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const startY = useRef<number | null>(null);
  const dragging = useRef(false);

  const set = (v: number) => { pullRef.current = v; setPull(v); };
  const setBusy = (v: boolean) => { refreshingRef.current = v; setRefreshing(v); };

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia?.('(pointer: coarse)').matches) return;

    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current || e.touches.length !== 1) { startY.current = null; return; }
      if (window.scrollY > 0) { startY.current = null; return; }
      if (document.body.style.overflow === 'hidden') { startY.current = null; return; } // a modal is open
      startY.current = e.touches[0].clientY;
      dragging.current = false;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current === null || refreshingRef.current) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0 || window.scrollY > 0) { if (dragging.current) set(0); dragging.current = false; return; }
      const resisted = Math.min(MAX, dy * RESISTANCE);
      dragging.current = true;
      set(resisted);
      if (resisted > 3 && e.cancelable) e.preventDefault(); // stop native overscroll once engaged
    };
    const onEnd = () => {
      if (startY.current === null) return;
      startY.current = null;
      const engaged = dragging.current;
      dragging.current = false;
      if (engaged && pullRef.current >= THRESHOLD && !refreshingRef.current) {
        setBusy(true); set(THRESHOLD);
        Promise.resolve(onRefresh()).finally(() => { setBusy(false); set(0); });
      } else {
        set(0);
      }
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, [onRefresh]);

  const progress = Math.min(1, pull / THRESHOLD);
  const active = pull > 0 || refreshing;

  return (
    <div className="relative">
      {/* Indicator sits above the content and is revealed as it pulls down */}
      <div
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 z-10 flex items-center justify-center"
        style={{ top: -44, transform: `translate(-50%, ${pull}px)`, opacity: active ? 1 : 0 }}
      >
        <div className="w-9 h-9 rounded-full bg-surface border border-ink/10 shadow-md flex items-center justify-center">
          <RefreshCw
            size={17}
            className={refreshing ? 'text-primary animate-spin' : 'text-gray-custom'}
            style={refreshing ? undefined : { transform: `rotate(${progress * 270}deg)`, opacity: 0.4 + progress * 0.6 }}
          />
        </div>
      </div>
      {/* transform stays `none` at rest — a translateY(0) still creates a
          containing block and would break descendant position:fixed elements. */}
      <div style={{ transform: pull > 0 ? `translateY(${pull}px)` : undefined, transition: pull === 0 || refreshing ? 'transform 0.2s ease-out' : 'none' }}>
        {children}
      </div>
    </div>
  );
}
