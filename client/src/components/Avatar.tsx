/**
 * Identity marks — the initials system for people, team crests and tournament
 * marks. The single most repeated visual in the product: most accounts have no
 * photo, so the placeholder IS the product.
 *
 * Design rules:
 *  • Deterministic duotone: a name always hashes to the same gradient, so
 *    "Aarav Naik" is the same colour on the feed, rankings, messages, admin.
 *  • Two-letter initials (first + last word), font-display, white on a
 *    saturated gradient — legible in both themes with no per-mode branching.
 *  • Subtle ring via the theme `ink` token so marks sit on any surface.
 *  • Shapes carry meaning: people are circles; teams and tournaments are
 *    squircles. A photo/logo, when present, uses the same shape + ring.
 */

import type { CSSProperties } from 'react';

const PALETTE: ReadonlyArray<readonly [string, string]> = [
  ['#6366f1', '#4338ca'], // indigo
  ['#0ea5e9', '#0369a1'], // sky
  ['#14b8a6', '#0f766e'], // teal
  ['#10b981', '#047857'], // emerald
  ['#f59e0b', '#b45309'], // amber
  ['#f97316', '#c2410c'], // orange
  ['#f43f5e', '#be123c'], // rose
  ['#d946ef', '#a21caf'], // fuchsia
  ['#8b5cf6', '#6d28d9'], // violet
  ['#06b6d4', '#0e7490'], // cyan
];

/** Stable hash → palette slot. Deterministic per name, well-spread. */
function paletteFor(name: string): readonly [string, string] {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

/** "Aarav Naik" → "AN", "Radar" → "RA", "" → "•".
 *  Pure-number words are skipped ("Goa Cup 2026" → "GC", not "G2"). */
export function initialsOf(name?: string | null): string {
  const clean = (name ?? '').trim();
  if (!clean) return '•';
  let words = clean.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  const lettered = words.filter((w) => /\p{L}/u.test(w));
  if (lettered.length > 0) words = lettered;
  if (words.length === 0) return clean.slice(0, 1).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

interface MarkProps {
  name?: string | null;
  src?: string | null;
  /** Pixel size (width = height). Text scales with it. */
  size?: number;
  className?: string;
  alt?: string;
}

function Mark({ name, src, size = 40, className = '', alt, radius }: MarkProps & { radius: string }) {
  const style: CSSProperties = { width: size, height: size, borderRadius: radius };
  if (src) {
    return (
      <img
        src={src}
        alt={alt ?? name ?? ''}
        loading="lazy"
        decoding="async"
        style={style}
        className={`object-cover shrink-0 ring-1 ring-ink/15 ${className}`}
      />
    );
  }
  const [from, to] = paletteFor(name ?? '');
  return (
    <span
      role="img"
      aria-label={alt ?? name ?? ''}
      style={{
        ...style,
        backgroundImage: `linear-gradient(135deg, ${from}, ${to})`,
        fontSize: Math.max(10, Math.round(size * 0.36)),
      }}
      className={`inline-flex items-center justify-center select-none shrink-0 font-display font-bold text-white ring-1 ring-ink/15 ${className}`}
    >
      {initialsOf(name)}
    </span>
  );
}

/** A person. Always a circle. */
export default function Avatar(props: MarkProps) {
  return <Mark {...props} radius="9999px" />;
}

/** A team crest. Squircle so entities read differently from people. */
export function TeamCrest(props: MarkProps) {
  return <Mark {...props} radius="28%" />;
}

/** A tournament mark. Same squircle family as teams. */
export function TournamentMark(props: MarkProps) {
  return <Mark {...props} radius="28%" />;
}
