import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  urls: string[];
  alt?: string;
  className?: string;
}

// How far (as a fraction of the carousel's width) the user has to drag
// before releasing commits to the adjacent slide. 20% feels responsive
// without triggering on accidental nudges.
const SWIPE_COMMIT_RATIO = 0.2;

export default function ImageCarousel({ urls, alt = '', className = '' }: Props) {
  const [idx, setIdx] = useState(0);
  const [dragX, setDragX] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  // Null when no touch is in progress. locked is 'x' | 'y' | null — once we
  // detect the dominant swipe axis we commit to it so vertical scrolls don't
  // tug the carousel and horizontal swipes don't fight the page scroll.
  const touchRef = useRef<{ x: number; y: number; locked: 'x' | 'y' | null } | null>(null);

  if (urls.length === 0) return null;
  if (urls.length === 1) {
    return <img src={urls[0]} alt={alt} className={`w-full max-h-[32rem] object-contain bg-black ${className}`} />;
  }

  // Stop propagation so clicking a nav chevron/dot doesn't also trigger the
  // parent (e.g. the feed card's open-in-modal handler).
  const goPrev = () => setIdx((i) => (i === 0 ? urls.length - 1 : i - 1));
  const goNext = () => setIdx((i) => (i === urls.length - 1 ? 0 : i + 1));

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY, locked: null };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const state = touchRef.current;
    if (!state) return;
    const t = e.touches[0];
    const dx = t.clientX - state.x;
    const dy = t.clientY - state.y;
    // Decide axis once the gesture clears an ambiguity threshold.
    if (state.locked == null && Math.abs(dx) + Math.abs(dy) > 10) {
      state.locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (state.locked === 'x') {
      setDragX(dx);
    }
  };

  const onTouchEnd = () => {
    const state = touchRef.current;
    touchRef.current = null;
    if (!state || state.locked !== 'x') {
      setDragX(0);
      return;
    }
    const width = containerRef.current?.clientWidth ?? 1;
    const threshold = width * SWIPE_COMMIT_RATIO;
    if (dragX < -threshold && idx < urls.length - 1) {
      setIdx((i) => i + 1);
    } else if (dragX > threshold && idx > 0) {
      setIdx((i) => i - 1);
    }
    setDragX(0);
  };

  const isDragging = dragX !== 0;

  return (
    <div
      ref={containerRef}
      className={`relative group bg-black overflow-hidden select-none ${className}`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {/* Track — one slide per image, offset by translateX. During an active
          swipe we drop the transition so the slide follows the finger; when
          the touch ends the spring-back / commit animates. */}
      <div
        className="flex"
        style={{
          transform: `translate3d(calc(${-idx * 100}% + ${dragX}px), 0, 0)`,
          transition: isDragging ? 'none' : 'transform 300ms cubic-bezier(0.22, 0.61, 0.36, 1)',
          willChange: 'transform',
        }}
      >
        {urls.map((url, i) => (
          <img
            key={i}
            src={url}
            alt={`${alt} ${i + 1}`}
            draggable={false}
            className="w-full shrink-0 max-h-[32rem] object-contain"
          />
        ))}
      </div>

      {/* Left arrow */}
      <button
        onClick={(e) => { e.stopPropagation(); goPrev(); }}
        className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <ChevronLeft size={18} />
      </button>

      {/* Right arrow */}
      <button
        onClick={(e) => { e.stopPropagation(); goNext(); }}
        className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <ChevronRight size={18} />
      </button>

      {/* Dot indicators */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
        {urls.map((_, i) => (
          <button
            key={i}
            onClick={(e) => { e.stopPropagation(); setIdx(i); }}
            className={`h-1.5 rounded-full transition-all ${
              i === idx ? 'bg-white w-3' : 'bg-white/50 w-1.5'
            }`}
          />
        ))}
      </div>

      {/* Counter badge */}
      <span className="absolute top-3 right-3 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
        {idx + 1}/{urls.length}
      </span>
    </div>
  );
}
