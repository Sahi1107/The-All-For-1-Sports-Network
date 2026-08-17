import { useMemo, useState } from 'react';
import type { DerivedShot, BasketballVariant, CourtGeometry } from '@af1/core';
import { courtFor, rulesFor } from '@af1/core';
import { HalfCourt } from './Court';

/** Where a half-court point sits in the HalfCourt viewBox. */
function halfCourtXY(hx: number, hy: number, geo: CourtGeometry): { cx: number; cy: number } {
  return {
    cx: hx * geo.widthM,
    // hy runs baseline→far edge, but the chart puts the baseline at the BOTTOM,
    // so it inverts.
    cy: geo.chartDepthM - hy * geo.chartDepthM,
  };
}

// Made is green, missed is red — the one convention every basketball reader
// already knows, so the chart needs no legend to be understood at a glance.
const MADE = '#22c55e';
const MISS = '#ef4444';

export interface ShotPlayerLookup {
  (playerId: string): { name: string; jersey: number | null } | undefined;
}

interface HoverState {
  shot: DerivedShot;
  /** Percentage position within the chart box, for the tooltip. */
  left: number;
  top: number;
}

/**
 * Team or player shot chart.
 *
 * In 5v5 both ends of the floor fold onto one half-court frame (see @af1/core's
 * toHalfCourt), so a team's whole game reads as a single picture rather than two
 * half-empty ones that swap over at the interval. In 3x3 there is only ever one
 * end, so the frame IS the court and nothing is folded.
 */
export function ShotChart({
  shots,
  lookup,
  title,
  variant,
  emptyHint = 'No field-goal attempts recorded yet.',
}: {
  shots: DerivedShot[];
  lookup: ShotPlayerLookup;
  title?: string;
  /** The code being played — sets the floor and what a made shot is worth. */
  variant?: BasketballVariant | null;
  emptyHint?: string;
}) {
  const [hover, setHover] = useState<HoverState | null>(null);
  const geo = courtFor(variant);
  const rules = rulesFor(variant);

  const summary = useMemo(() => {
    const made = shots.filter((s) => s.made).length;
    // Filtered on ZONE, not on point value: in 3x3 a behind-the-arc shot is
    // worth 2, which is what an inside-the-arc shot is worth in 5v5 — matching
    // on the number would put layups in the "long range" column.
    const deep = shots.filter((s) => s.zone === 'BEHIND_ARC');
    const deepMade = deep.filter((s) => s.made).length;
    return {
      made,
      attempts: shots.length,
      pct: shots.length ? Math.round((made / shots.length) * 100) : 0,
      deepMade,
      deepAtt: deep.length,
    };
  }, [shots]);

  // "3PT" in 5v5, "2PT" in 3x3 — the same zone, named for what it pays here.
  const deepLabel = `${rules.values.behindArc}PT`;

  return (
    <div className="bb-chart">
      {title && (
        <div className="bb-chart-head">
          <strong>{title}</strong>
          <span className="bb-chart-sum">
            {summary.made}/{summary.attempts} FG ({summary.pct}%)
            {summary.deepAtt > 0 && <> · {summary.deepMade}/{summary.deepAtt} {deepLabel}</>}
          </span>
        </div>
      )}
      <div className="bb-chart-box" onPointerLeave={() => setHover(null)}>
        <HalfCourt variant={variant}>
          {shots.map((s) => {
            const { cx, cy } = halfCourtXY(s.half.hx, s.half.hy, geo);
            return (
              <g key={s.eventId}>
                {/* A wider transparent disc under each marker: the visible dot is
                    small enough that hovering it on a touch screen or a packed
                    paint would otherwise be near impossible. */}
                <circle
                  cx={cx} cy={cy} r={0.85} fill="transparent"
                  style={{ cursor: 'pointer' }}
                  onPointerEnter={() => setHover({
                    shot: s,
                    left: (cx / geo.widthM) * 100,
                    top: (cy / geo.chartDepthM) * 100,
                  })}
                />
                {s.made ? (
                  <circle cx={cx} cy={cy} r={0.42} fill={MADE} fillOpacity={0.85} stroke="#062d16" strokeWidth={0.07} pointerEvents="none" />
                ) : (
                  // Misses are drawn as a cross, not just a red dot. Colour alone
                  // separates them for most readers but not for the red-green
                  // colour blind, who are ~8% of men — the shape carries it too.
                  <g pointerEvents="none" stroke={MISS} strokeWidth={0.16} strokeLinecap="round" opacity={0.9}>
                    <line x1={cx - 0.32} y1={cy - 0.32} x2={cx + 0.32} y2={cy + 0.32} />
                    <line x1={cx - 0.32} y1={cy + 0.32} x2={cx + 0.32} y2={cy - 0.32} />
                  </g>
                )}
              </g>
            );
          })}
        </HalfCourt>

        {hover && (
          <ShotTooltip
            shot={hover.shot}
            who={lookup(hover.shot.playerId)}
            periodLabel={rules.periodLabel}
            left={hover.left}
            top={hover.top}
          />
        )}

        {shots.length === 0 && <div className="bb-chart-empty">{emptyHint}</div>}
      </div>
    </div>
  );
}

function ShotTooltip({ shot, who, periodLabel, left, top }: {
  shot: DerivedShot;
  who: { name: string; jersey: number | null } | undefined;
  periodLabel: string;
  left: number;
  top: number;
}) {
  const mins = Math.floor(shot.clockMs / 60000);
  const secs = Math.floor((shot.clockMs % 60000) / 1000);
  return (
    <div
      className="bb-chart-tip"
      style={{
        left: `${left}%`,
        top: `${top}%`,
        // Flip above/below the marker near the edges so the tooltip never sits
        // off the chart where it can't be read.
        transform: `translate(-50%, ${top > 70 ? 'calc(-100% - 14px)' : '14px'})`,
      }}
      role="tooltip"
    >
      <span className="bb-tip-who">
        <span className="bb-tip-jersey">#{who?.jersey ?? '–'}</span>
        {who?.name ?? 'Unknown player'}
      </span>
      <span className={`bb-tip-result ${shot.made ? 'made' : 'miss'}`}>
        {/* The value under THIS code — a corner shot reads 2PT in 3x3, 3PT in 5v5. */}
        {shot.value}PT {shot.made ? 'MADE' : 'MISS'}
      </span>
      <span className="bb-tip-meta">
        {periodLabel}{shot.quarter} · {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')} ·{' '}
        {shot.half.distanceM.toFixed(1)}m
      </span>
    </div>
  );
}

/**
 * Live shot markers drawn on the entry court, so an analyst can see what they've
 * already logged this game without leaving the entry surface.
 */
export function LiveShotLayer({ shots, variant }: {
  shots: DerivedShot[];
  variant?: BasketballVariant | null;
}) {
  const geo = courtFor(variant);
  return (
    <g pointerEvents="none">
      {shots.map((s) => {
        const cx = s.x * geo.lengthM;
        const cy = s.y * geo.widthM;
        return s.made ? (
          <circle key={s.eventId} cx={cx} cy={cy} r={0.3} fill={MADE} fillOpacity={0.75} />
        ) : (
          <g key={s.eventId} stroke={MISS} strokeWidth={0.13} strokeLinecap="round" opacity={0.8}>
            <line x1={cx - 0.24} y1={cy - 0.24} x2={cx + 0.24} y2={cy + 0.24} />
            <line x1={cx - 0.24} y1={cy + 0.24} x2={cx + 0.24} y2={cy - 0.24} />
          </g>
        );
      })}
    </g>
  );
}
