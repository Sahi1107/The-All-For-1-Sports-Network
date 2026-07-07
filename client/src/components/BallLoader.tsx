import { useState, useEffect } from 'react';

// Shared/universal loading animation — a dribbling ball that cycles through the
// sports the platform supports. On-brand via the `primary` theme token (lime in
// dark, blue in light). Lightweight: pure Tailwind animations + one interval, no
// extra deps. Use <BallLoader /> anywhere a page/section is loading; keep small
// in-button spinners as spinners (a bouncing ball inside a button reads wrong).

const SPORTS = ['⚽', '🏀', '🏏', '🏸', '🏑', '🏐', '🎾', '🏓', '🏊', '🏉', '🥊', '🏹'];

const BALL = { sm: 'text-2xl', md: 'text-4xl', lg: 'text-5xl' } as const;
const SHADOW = { sm: 'w-6', md: 'w-9', lg: 'w-11' } as const;

export type BallLoaderSize = keyof typeof BALL;

export default function BallLoader({
  size = 'md',
  fullScreen = false,
  className = '',
}: {
  size?: BallLoaderSize;
  /** Center in a full-screen surface (route/auth loading). */
  fullScreen?: boolean;
  className?: string;
}) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % SPORTS.length), 450);
    return () => clearInterval(id);
  }, []);

  const inner = (
    <div
      className={`flex flex-col items-center ${className}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className={`${BALL[size]} animate-bounce`} style={{ animationDuration: '0.6s' }} aria-hidden>
        {SPORTS[i]}
      </span>
      {/* dribble shadow — lime/blue (primary), pulses beneath the ball */}
      <span className={`mt-1 h-1.5 ${SHADOW[size]} rounded-[100%] bg-primary/30 blur-[1px] animate-pulse`} />
      <span className="sr-only">Loading…</span>
    </div>
  );

  if (fullScreen) {
    return <div className="flex items-center justify-center min-h-screen bg-surface">{inner}</div>;
  }
  return inner;
}
