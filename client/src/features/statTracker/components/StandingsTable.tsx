import type { StandingRow } from '../stats';

/** Signed goal-difference: +4 / 0 / −4 (uses a real minus glyph). */
const fmtGD = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

/** League / group standings table. When `advanceCount` is set, the top N rows
 *  are marked as qualifying (used for MIXED group stages). */
export default function StandingsTable({
  title,
  rows,
  advanceCount,
}: {
  title: string;
  rows: StandingRow[];
  advanceCount?: number;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-custom mb-2">{title}</h3>
      <div className="bg-card rounded-xl border border-line overflow-hidden">
        <div className="grid grid-cols-[1.5rem_2fr_repeat(6,1fr)] gap-1 px-4 py-2 text-[11px] text-gray-custom border-b border-line">
          <span className="text-center">#</span>
          <span>Team</span>
          <span className="text-center">P</span><span className="text-center">W</span>
          <span className="text-center">D</span><span className="text-center">L</span>
          <span className="text-center">GD</span><span className="text-center">Pts</span>
        </div>
        {rows.map((r, i) => {
          const qualifies = advanceCount !== undefined && i < advanceCount;
          return (
            <div
              key={r.teamId}
              className={`grid grid-cols-[1.5rem_2fr_repeat(6,1fr)] gap-1 px-4 py-2 text-sm border-b border-line last:border-0 ${
                qualifies ? 'bg-primary/5' : ''
              }`}
            >
              <span className="text-center text-gray-custom flex items-center justify-center gap-1">
                {qualifies && <span className="w-1.5 h-1.5 rounded-full bg-primary" title="Advances" />}
                {i + 1}
              </span>
              <span className="truncate">{r.teamName}</span>
              <span className="text-center">{r.played}</span><span className="text-center">{r.wins}</span>
              <span className="text-center">{r.draws}</span><span className="text-center">{r.losses}</span>
              <span className="text-center tabular-nums">{fmtGD(r.goalDifference)}</span>
              <span className="text-center font-semibold text-primary-light">{r.points}</span>
            </div>
          );
        })}
      </div>
      {advanceCount !== undefined && (
        <p className="text-[11px] text-gray-custom mt-1.5 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" /> Top {advanceCount} advance to the knockout stage
        </p>
      )}
    </div>
  );
}
