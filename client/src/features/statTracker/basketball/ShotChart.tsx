import { useMemo, useState } from 'react';
import type { DerivedShot } from '@af1/core';
import { COURT_LENGTH_M, COURT_WIDTH_M, HALF_LENGTH_M } from '@af1/core';
import { HalfCourt } from './Court';

/** Where a half-court point sits in the HalfCourt viewBox. */
function halfCourtXY(hx: number, hy: number): { cx: number; cy: number } {
  return {
    cx: hx * COURT_WIDTH_M,
    // hy runs baseline→midcourt, but the chart puts the baseline at the BOTTOM,
    // so it inverts.
    cy: HALF_LENGTH_M - hy * HALF_LENGTH_M,
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
 * Both ends of the floor fold onto one half-court frame (see @af1/core's
 * toHalfCourt), so a team's whole game reads as a single picture rather than two
 * half-empty ones that swap over at the interval.
 */
export function ShotChart({
  shots,
  lookup,
  title,
  emptyHint = 'No field-goal attempts recorded yet.',
}: {
  shots: DerivedShot[];
  lookup: ShotPlayerLookup;
  title?: string;
  emptyHint?: string;
}) {
  const [hover, setHover] = useState<HoverState | null>(null);

  const summary = useMemo(() => {
    const made = shots.filter((s) => s.made).length;
    const three = shots.filter((s) => s.value === 3);
    const threeMade = three.filter((s) => s.made).length;
    return {
      made,
      attempts: shots.length,
      pct: shots.length ? Math.round((made / shots.length) * 100) : 0,
      threeMade,
      threeAtt: three.length,
    };
  }, [shots]);

  return (
    <div className="bb-chart">
      {title && (
        <div className="bb-chart-head">
          <strong>{title}</strong>
          <span className="bb-chart-sum">
            {summary.made}/{summary.attempts} FG ({summary.pct}%)
            {summary.threeAtt > 0 && <> · {summary.threeMade}/{summary.threeAtt} 3PT</>}
          </span>
        </div>
      )}
      <div className="bb-chart-box" onPointerLeave={() => setHover(null)}>
        <HalfCourt>
          {shots.map((s) => {
            const { cx, cy } = halfCourtXY(s.half.hx, s.half.hy);
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
                    left: (cx / COURT_WIDTH_M) * 100,
                    top: (cy / (COURT_LENGTH_M / 2)) * 100,
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
            left={hover.left}
            top={hover.top}
          />
        )}

        {shots.length === 0 && <div className="bb-chart-empty">{emptyHint}</div>}
      </div>
    </div>
  );
}

function ShotTooltip({ shot, who, left, top }: {
  shot: DerivedShot;
  who: { name: string; jersey: number | null } | undefined;
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
        {shot.value}PT {shot.made ? 'MADE' : 'MISS'}
      </span>
      <span className="bb-tip-meta">
        Q{shot.quarter} · {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')} ·{' '}
        {shot.half.distanceM.toFixed(1)}m
      </span>
    </div>
  );
}

/**
 * Live shot markers drawn on the full entry court, so an analyst can see what
 * they've already logged this game without leaving the entry surface.
 */
export function LiveShotLayer({ shots }: { shots: DerivedShot[] }) {
  return (
    <g pointerEvents="none">
      {shots.map((s) => {
        const cx = s.x * COURT_LENGTH_M;
        const cy = s.y * COURT_WIDTH_M;
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
