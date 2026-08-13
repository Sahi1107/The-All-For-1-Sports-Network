import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

// Autoplay, muted, when the clip scrolls into view; pause when it scrolls out —
// standard social-feed behaviour. Honours the two "don't move / don't spend my
// data" signals: prefers-reduced-motion and the Data Saver hint. In either case
// we never autoplay — the clip sits paused on its poster with normal controls.
function autoplayAllowed(): boolean {
  if (typeof window === 'undefined') return false;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const saveData = Boolean((navigator as unknown as { connection?: { saveData?: boolean } }).connection?.saveData);
  return !reduce && !saveData;
}

/** A feed video that plays muted while in view and pauses when out. Native
 *  controls stay available; a prominent tap target toggles sound (feed clips
 *  start muted because browsers only allow muted autoplay). */
export default function FeedVideo({
  src, poster, className,
}: { src: string; poster?: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  // Decide once, on mount — the accessibility/data preference doesn't change
  // mid-scroll, and re-reading it per intersection is wasteful.
  const allow = useRef(false);

  useEffect(() => {
    allow.current = autoplayAllowed();
    const el = ref.current;
    if (!el || !allow.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.5) {
            // Autoplay can still be rejected by the browser — ignore the reject.
            void el.play().catch(() => {});
          } else if (!el.paused) {
            el.pause();
          }
        }
      },
      { threshold: [0, 0.5, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const el = ref.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
    if (!el.muted) void el.play().catch(() => {});
  };

  return (
    <>
      <video
        ref={ref}
        src={src}
        poster={poster}
        muted={muted}
        playsInline
        controls
        preload="metadata"
        className={className ?? 'w-full h-full object-contain'}
      />
      <button
        type="button"
        onClick={toggleMute}
        aria-label={muted ? 'Unmute video' : 'Mute video'}
        className="absolute top-2 right-2 z-10 inline-flex items-center justify-center w-8 h-8 rounded-full bg-black/55 backdrop-blur-sm text-white/90 hover:bg-black/75 transition-colors"
      >
        {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
      </button>
    </>
  );
}
