import { BadgeCheck } from 'lucide-react';

/**
 * Shared feed primitives that apply the "Feed Card + Type / Color System".
 *
 * Type roles: `font-display` (Archivo) for labels/eyebrows, `font-numeric`
 * (Saira Semi Condensed, tabular) for ratings/scores/counts, default Inter for
 * body copy. Accent discipline: `primary` = brand + verification only, red =
 * likes/downward, green = reposts/upward, one neutral chip for role & position.
 *
 * Everything here is built on the semantic theme tokens (surface/card/elevated/
 * line/foreground/primary), so each component renders correctly in both the dark
 * and light themes with no per-mode branching.
 */

export interface Performance {
  statValue: string;
  statLabel: string;
  ratingDelta?: string;
  rating?: string;
  eyebrow?: string;
  context?: string;
}

/** Lime/blue verification tick — brand accent, verification only. */
export function VerifiedTick({ size = 15 }: { size?: number }) {
  return (
    <BadgeCheck
      size={size}
      className="text-primary shrink-0"
      aria-label="Verified"
    />
  );
}

/** Name + verification, leading the header hierarchy. */
export function NameLine({
  name,
  verified,
  className = '',
}: {
  name?: string;
  verified?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 min-w-0 ${className}`}>
      <span className="font-display font-bold truncate">{name}</span>
      {verified && <VerifiedTick />}
    </span>
  );
}

/** One neutral role chip — not five colors. */
export function RoleChip({ role }: { role?: string }) {
  if (!role) return null;
  return (
    <span className="font-display font-bold tracking-wide uppercase text-[10px] leading-none px-1.5 py-1 rounded bg-ink/10 text-foreground/70">
      {role}
    </span>
  );
}

/**
 * The disciplined meta line: a single neutral role chip followed by
 * "Sport · Position", collapsed to one row.
 */
export function PostMeta({
  role,
  sport,
  position,
}: {
  role?: string;
  sport?: string;
  position?: string | null;
}) {
  const isAdmin = role === 'ADMIN';
  const bits = [
    !isAdmin && sport ? cap(sport) : null,
    !isAdmin && position ? position : null,
  ].filter(Boolean);

  return (
    <div className="flex items-center gap-2 mt-0.5 min-w-0">
      <RoleChip role={role} />
      {bits.length > 0 && (
        <span className="text-xs text-gray-custom truncate">{bits.join(' · ')}</span>
      )}
    </div>
  );
}

/**
 * Performance moment — a verified result rendered as a stat card instead of
 * plain text. Big tabular numeral leads; the rating change reads as an upward
 * (green) pill.
 */
export function PerformanceCard({
  performance,
  verified,
}: {
  performance: Performance;
  verified?: boolean;
}) {
  const { statValue, statLabel, ratingDelta, eyebrow, context } = performance;
  const eyebrowText = [eyebrow, verified ? 'Verified' : null]
    .filter(Boolean)
    .join(' · ')
    .toUpperCase();

  return (
    <div className="relative overflow-hidden rounded-xl border border-primary/25 bg-primary/[0.07] px-4 py-3.5">
      {eyebrowText && (
        <p className="font-display font-bold tracking-[0.12em] text-[10px] text-primary/90 mb-1.5">
          {eyebrowText}
        </p>
      )}
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="font-numeric font-bold tabular-nums leading-none text-4xl sm:text-5xl text-foreground">
            {statValue}
          </span>
          <span className="font-display font-bold text-sm text-foreground/70 uppercase tracking-wide">
            {statLabel}
          </span>
        </div>
        {ratingDelta && (
          <span className="shrink-0 inline-flex items-center font-numeric font-semibold tabular-nums text-xs px-2.5 py-1 rounded-full bg-green-500/15 text-green-500">
            {ratingDelta}
          </span>
        )}
      </div>
      {context && (
        <p className="text-xs text-gray-custom mt-2 truncate">{context}</p>
      )}
    </div>
  );
}

/** Small lime/blue "RATING" badge surfaced on a media frame. */
export function RatingBadge({ rating }: { rating: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-card/90 backdrop-blur-sm pl-1.5 pr-2.5 py-1 shadow-lg">
      <VerifiedTick size={14} />
      <span className="font-numeric font-bold tabular-nums text-sm text-foreground leading-none">
        {rating}
      </span>
      <span className="font-display font-bold text-[9px] tracking-wide text-foreground/50 uppercase">
        Rating
      </span>
    </span>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
