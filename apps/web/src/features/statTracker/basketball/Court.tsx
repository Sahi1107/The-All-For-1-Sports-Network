import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { courtFor, type CourtGeometry, type BasketballVariant } from '@af1/core';

// The court is drawn in metres and scaled by the viewBox, so every line sits
// exactly where @af1/core's geometry says it does. A click therefore lands on
// the same coordinates the shot chart will later plot it at — if this were
// hand-tuned in pixels the two would drift and shots would render off-spot.
//
// ONE COMPONENT, TWO FLOORS. A 5v5 court is 28 × 15 with a basket at each end; a
// 3x3 court is 15 × 11 with one. Both are read from the CourtGeometry the
// variant selects, so the markings, the click mapping and the chart can never
// disagree about which floor is being played on.

/** Line colour/width shared by both the entry court and the chart. */
const LINE = 'rgba(255,255,255,0.55)';
const LINE_W = 0.08;

/** Where the arc meets the straight corner section, as a depth from baseline. */
function cornerGeometry(geo: CourtGeometry) {
  const halfSpan = geo.widthM / 2 - geo.cornerInsetM;
  return {
    halfSpan,
    arcMeetsDepth: geo.basketInsetM + Math.sqrt(Math.max(0, geo.threeRadiusM ** 2 - halfSpan ** 2)),
  };
}

/**
 * One end's markings, drawn from the baseline at x = 0 running to +x.
 * `flip` mirrors it onto the far end so a single definition serves both.
 */
function HalfCourtMarkings({ geo, flip = false }: { geo: CourtGeometry; flip?: boolean }) {
  const t = flip ? `translate(${geo.lengthM} 0) scale(-1 1)` : undefined;
  const cy = geo.widthM / 2;
  const { halfSpan, arcMeetsDepth } = cornerGeometry(geo);
  // The 3pt arc: from where it meets one corner line, round to the other.
  const arc = [
    `M ${arcMeetsDepth} ${cy - halfSpan}`,
    `A ${geo.threeRadiusM} ${geo.threeRadiusM} 0 0 1 ${arcMeetsDepth} ${cy + halfSpan}`,
  ].join(' ');

  return (
    <g transform={t} fill="none" stroke={LINE} strokeWidth={LINE_W}>
      {/* corner threes — straight sections from the baseline to the arc */}
      <line x1={0} y1={cy - halfSpan} x2={arcMeetsDepth} y2={cy - halfSpan} />
      <line x1={0} y1={cy + halfSpan} x2={arcMeetsDepth} y2={cy + halfSpan} />
      <path d={arc} />
      {/* key + free-throw circle */}
      <rect x={0} y={cy - geo.keyWidthM / 2} width={geo.keyDepthM} height={geo.keyWidthM} />
      <circle cx={geo.keyDepthM} cy={cy} r={geo.circleRadiusM} />
      {/* no-charge semicircle + backboard + ring */}
      <path d={`M ${geo.basketInsetM} ${cy - geo.restrictedRadiusM} A ${geo.restrictedRadiusM} ${geo.restrictedRadiusM} 0 0 1 ${geo.basketInsetM} ${cy + geo.restrictedRadiusM}`} />
      <line x1={1.2} y1={cy - 0.9} x2={1.2} y2={cy + 0.9} strokeWidth={LINE_W * 1.6} />
      <circle cx={geo.basketInsetM} cy={cy} r={0.225} />
    </g>
  );
}

/**
 * The playing area's outline plus its markings.
 *
 * A two-basket floor gets both ends, a centre line and a centre circle. A
 * one-basket floor gets neither: 3x3 has no halfway line to draw and no jump
 * ball at centre, so drawing them would render a court that does not exist.
 */
function CourtBase({ geo }: { geo: CourtGeometry }) {
  const cy = geo.widthM / 2;
  const mid = geo.lengthM / 2;
  return (
    <>
      <rect
        x={0} y={0} width={geo.lengthM} height={geo.widthM}
        fill="url(#af1-court-floor)" stroke={LINE} strokeWidth={LINE_W}
      />
      {geo.twoBaskets && (
        <>
          <line x1={mid} y1={0} x2={mid} y2={geo.widthM} stroke={LINE} strokeWidth={LINE_W} />
          <circle cx={mid} cy={cy} r={geo.circleRadiusM} fill="none" stroke={LINE} strokeWidth={LINE_W} />
        </>
      )}
      <HalfCourtMarkings geo={geo} />
      {geo.twoBaskets && <HalfCourtMarkings geo={geo} flip />}
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
  /** Normalised to the rendered playing area, 0..1 on each axis. */
  x: number;
  y: number;
}

/**
 * The entry court. Clicking it reports a normalised position; the caller decides
 * what that means (it's only live while a shot is armed).
 */
export function EntryCourt({
  variant,
  armed,
  onPick,
  overlay,
  children,
}: {
  /** Which floor to draw. Absent ⇒ 5v5. */
  variant?: BasketballVariant | null;
  /** Whether a shot is waiting for a location. Drives the cursor and the glow. */
  armed: boolean;
  onPick: (p: CourtClick) => void;
  /** Banner shown across the court while armed (who, and what shot). */
  overlay?: ReactNode;
  /** Markers drawn on top — the live shot layer. */
  children?: ReactNode;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const geo = courtFor(variant);

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
    <div className={`bb-court-wrap${armed ? ' armed' : ''}${geo.twoBaskets ? '' : ' half'}`}>
      <svg
        ref={svgRef}
        className="bb-court"
        viewBox={`0 0 ${geo.lengthM} ${geo.widthM}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerDown={handle}
        role={armed ? 'button' : undefined}
        aria-label={armed ? 'Click the spot the shot was taken from' : 'Court'}
      >
        <FloorGradient />
        <CourtBase geo={geo} />
        {children}
      </svg>
      {overlay}
    </div>
  );
}

/** A half-court frame for shot charts. Baseline at the bottom, far edge at top. */
export function HalfCourt({ variant, children }: {
  variant?: BasketballVariant | null;
  children?: ReactNode;
}) {
  const geo = courtFor(variant);
  return (
    <svg
      className="bb-halfcourt"
      // Rotated presentation: width = court width, height = the charted depth,
      // with the baseline along the bottom edge, which is how a shot chart reads.
      viewBox={`0 0 ${geo.widthM} ${geo.chartDepthM}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <FloorGradient />
      {/* Draw the standard markings, then rotate them into the chart's
          orientation so this shares CourtBase's geometry exactly. */}
      <g transform={`rotate(-90) translate(${-geo.chartDepthM} 0) scale(1 1)`}>
        <rect x={0} y={0} width={geo.chartDepthM} height={geo.widthM} fill="url(#af1-court-floor)" stroke={LINE} strokeWidth={LINE_W} />
        <HalfCourtMarkings geo={geo} />
      </g>
      {children}
    </svg>
  );
}
