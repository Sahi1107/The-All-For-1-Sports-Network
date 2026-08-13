import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import {
  COURT_LENGTH_M, COURT_WIDTH_M, BASKET_INSET_M, THREE_RADIUS_M, CORNER_INSET_M,
  KEY_WIDTH_M, KEY_DEPTH_M, CIRCLE_RADIUS_M, RESTRICTED_RADIUS_M, HALF_LENGTH_M,
} from '@af1/core';

// The court is drawn in metres and scaled by the viewBox, so every line sits
// exactly where @af1/core's geometry says it does. A click therefore lands on
// the same coordinates the shot chart will later plot it at — if this were
// hand-tuned in pixels the two would drift and shots would render off-spot.

/** Line colour/width shared by both the entry court and the chart. */
const LINE = 'rgba(255,255,255,0.55)';
const LINE_W = 0.08;

/** Where the arc meets the straight corner section, as a depth from baseline. */
const CORNER_HALF_SPAN = COURT_WIDTH_M / 2 - CORNER_INSET_M;
const ARC_MEETS_CORNER_DEPTH =
  BASKET_INSET_M + Math.sqrt(Math.max(0, THREE_RADIUS_M ** 2 - CORNER_HALF_SPAN ** 2));

/**
 * One end's markings, drawn from the baseline at x = 0 running to +x.
 * `flip` mirrors it onto the far end so a single definition serves both.
 */
function HalfCourtMarkings({ flip = false }: { flip?: boolean }) {
  const t = flip ? `translate(${COURT_LENGTH_M} 0) scale(-1 1)` : undefined;
  const cy = COURT_WIDTH_M / 2;
  // The 3pt arc: from where it meets one corner line, round to the other.
  const arc = [
    `M ${ARC_MEETS_CORNER_DEPTH} ${cy - CORNER_HALF_SPAN}`,
    `A ${THREE_RADIUS_M} ${THREE_RADIUS_M} 0 0 1 ${ARC_MEETS_CORNER_DEPTH} ${cy + CORNER_HALF_SPAN}`,
  ].join(' ');

  return (
    <g transform={t} fill="none" stroke={LINE} strokeWidth={LINE_W}>
      {/* corner threes — straight sections from the baseline to the arc */}
      <line x1={0} y1={cy - CORNER_HALF_SPAN} x2={ARC_MEETS_CORNER_DEPTH} y2={cy - CORNER_HALF_SPAN} />
      <line x1={0} y1={cy + CORNER_HALF_SPAN} x2={ARC_MEETS_CORNER_DEPTH} y2={cy + CORNER_HALF_SPAN} />
      <path d={arc} />
      {/* key + free-throw circle */}
      <rect x={0} y={cy - KEY_WIDTH_M / 2} width={KEY_DEPTH_M} height={KEY_WIDTH_M} />
      <circle cx={KEY_DEPTH_M} cy={cy} r={CIRCLE_RADIUS_M} />
      {/* no-charge semicircle + backboard + ring */}
      <path d={`M ${BASKET_INSET_M} ${cy - RESTRICTED_RADIUS_M} A ${RESTRICTED_RADIUS_M} ${RESTRICTED_RADIUS_M} 0 0 1 ${BASKET_INSET_M} ${cy + RESTRICTED_RADIUS_M}`} />
      <line x1={1.2} y1={cy - 0.9} x2={1.2} y2={cy + 0.9} strokeWidth={LINE_W * 1.6} />
      <circle cx={BASKET_INSET_M} cy={cy} r={0.225} />
    </g>
  );
}

/** Full-court outline, centre line and centre circle. */
function CourtBase() {
  const cy = COURT_WIDTH_M / 2;
  return (
    <>
      <rect
        x={0} y={0} width={COURT_LENGTH_M} height={COURT_WIDTH_M}
        fill="url(#af1-court-floor)" stroke={LINE} strokeWidth={LINE_W}
      />
      <line x1={HALF_LENGTH_M} y1={0} x2={HALF_LENGTH_M} y2={COURT_WIDTH_M} stroke={LINE} strokeWidth={LINE_W} />
      <circle cx={HALF_LENGTH_M} cy={cy} r={CIRCLE_RADIUS_M} fill="none" stroke={LINE} strokeWidth={LINE_W} />
      <HalfCourtMarkings />
      <HalfCourtMarkings flip />
    </>
  );
}

function FloorGradient() {
  return (
    <defs>
      <linearGradient id="af1-court-floor" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#b8813f" />
        <stop offset="50%" stopColor="#a06f33" />
        <stop offset="100%" stopColor="#8a5d29" />
      </linearGradient>
    </defs>
  );
}

export interface CourtClick {
  /** Normalised to the full court as rendered, 0..1 on each axis. */
  x: number;
  y: number;
}

/**
 * The entry court. Clicking it reports a normalised position; the caller decides
 * what that means (it's only live while a shot is armed).
 */
export function EntryCourt({
  armed,
  onPick,
  overlay,
  children,
}: {
  /** Whether a shot is waiting for a location. Drives the cursor and the glow. */
  armed: boolean;
  onPick: (p: CourtClick) => void;
  /** Banner shown across the court while armed (who, and what shot). */
  overlay?: ReactNode;
  /** Markers drawn on top — the live shot layer. */
  children?: ReactNode;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  function handle(e: ReactPointerEvent<SVGSVGElement>) {
    if (!armed) return;
    const svg = svgRef.current;
    if (!svg) return;
    // Measure against the rendered box rather than the viewBox: the SVG scales
    // responsively, and using client coords directly would put every shot at the
    // wrong spot on anything but one exact window width.
    const r = svg.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    onPick({ x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) });
  }

  return (
    <div className={`bb-court-wrap${armed ? ' armed' : ''}`}>
      <svg
        ref={svgRef}
        className="bb-court"
        viewBox={`0 0 ${COURT_LENGTH_M} ${COURT_WIDTH_M}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={handle}
        role={armed ? 'button' : undefined}
        aria-label={armed ? 'Click the spot the shot was taken from' : 'Court'}
      >
        <FloorGradient />
        <CourtBase />
        {children}
      </svg>
      {overlay}
    </div>
  );
}

/** A half-court frame for shot charts. Baseline at the bottom, midcourt at top. */
export function HalfCourt({ children }: { children?: ReactNode }) {
  return (
    <svg
      className="bb-halfcourt"
      // Rotated presentation: width = court width, height = half the length,
      // with the baseline along the bottom edge, which is how a shot chart reads.
      viewBox={`0 0 ${COURT_WIDTH_M} ${HALF_LENGTH_M}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <FloorGradient />
      {/* Draw the standard half-court markings, then rotate them into the
          chart's orientation so this shares CourtBase's geometry exactly. */}
      <g transform={`rotate(-90) translate(${-HALF_LENGTH_M} 0) scale(1 1)`}>
        <rect x={0} y={0} width={HALF_LENGTH_M} height={COURT_WIDTH_M} fill="url(#af1-court-floor)" stroke={LINE} strokeWidth={LINE_W} />
        <HalfCourtMarkings />
      </g>
      {children}
    </svg>
  );
}

