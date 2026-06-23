import { SPORTS, type Sport } from '../data/sports';

const SPORT_ICONS: Record<string, string> = Object.fromEntries(
  SPORTS.map(({ value, icon }) => [value, icon]),
);

type SportIconProps = {
  sport: Sport | string;
  /** Extra classes, e.g. `text-2xl` to size the glyph. */
  className?: string;
};

/**
 * Renders a sport's Pictogrammers Material Design Icon via the MDI webfont
 * (loaded from CDN in index.html). Sizing follows font-size, so control it
 * with text-* classes. Returns null for unknown sports.
 */
export function SportIcon({ sport, className = '' }: SportIconProps) {
  const icon = SPORT_ICONS[sport];
  if (!icon) return null;
  return <i className={`mdi mdi-${icon} leading-none ${className}`} aria-hidden="true" />;
}
