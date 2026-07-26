import { useMemo } from 'react';
import { Play, CheckCircle2, BarChart3, Zap, SlidersHorizontal, CalendarClock, CalendarPlus } from 'lucide-react';
import type { TrackerSession, TrackerMatch } from '../types';
import { teamNames, DONE, stageSort, isBye } from './helpers';
import { fmtSchedule } from '../schedule';

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    SCHEDULED: 'bg-elevated text-gray-custom border-line',
    IN_PROGRESS: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    COMPLETED: 'bg-primary/20 text-primary-light border-primary/30',
    PUBLISHED: 'bg-accent/20 text-accent border-accent/30',
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium whitespace-nowrap ${map[status] ?? map.SCHEDULED}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

/** Fixtures grouped by stage, with per-match actions (track / resume / view,
 *  details, and — in demo mode — quick-sim). */
export default function FixturesList({
  session,
  onOpenMatch,
  onShowDetails,
  onQuickSim,
  onManageMatch,
}: {
  session: TrackerSession;
  onOpenMatch: (m: TrackerMatch) => void;
  onShowDetails: (m: TrackerMatch) => void;
  onQuickSim?: (m: TrackerMatch) => void;
  onManageMatch?: (m: TrackerMatch) => void;
  onAutoSchedule?: () => void;
}) {
  const name = teamNames(session);

  const byStage = useMemo(() => {
    const groups = new Map<string, TrackerMatch[]>();
    [...session.matches]
      .filter((m) => !isBye(m)) // byes are auto-resolved — not playable fixtures
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .forEach((m) => {
        if (!groups.has(m.stage)) groups.set(m.stage, []);
        groups.get(m.stage)!.push(m);
      });
    return [...groups.entries()].filter(([, ms]) => ms.length > 0).sort((a, b) => stageSort(a[0], b[0]));
  }, [session.matches]);

  return (
    <div className="space-y-6">
      {onAutoSchedule && (
        <div className="flex justify-end">
          <button
            onClick={onAutoSchedule}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-card border border-line hover:border-primary text-xs font-medium rounded-lg transition-colors"
          >
            <CalendarPlus size={13} /> Auto-schedule
          </button>
        </div>
      )}
      {byStage.map(([stage, matches]) => (
        <div key={stage}>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-custom mb-2">
            {stage === 'group' ? 'Group stage' : matches[0].round || stage}
          </h3>
          <div className="bg-card rounded-xl border border-line overflow-hidden divide-y divide-line">
            {matches.map((m) => {
              const ready = !!m.homeTeamId && !!m.awayTeamId;
              const done = DONE(m);
              const when = fmtSchedule(m.scheduledAt, m.court);
              return (
                <div key={m.id} className="px-4 py-3 space-y-1.5">
                  <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
                    <span className="text-right truncate">{name(m.homeTeamId)}</span>
                    <span className="font-mono font-semibold px-2 tabular-nums">
                      {m.status === 'SCHEDULED' ? 'vs' : `${m.homeScore}–${m.awayScore}`}
                    </span>
                    <span className="truncate">{name(m.awayTeamId)}</span>
                  </div>
                  <StatusBadge status={m.status} />

                  {done && (
                    <button
                      onClick={() => onShowDetails(m)}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-elevated border border-line hover:border-primary text-xs rounded-lg transition-colors"
                      title="Match details"
                    >
                      <BarChart3 size={13} /> Details
                    </button>
                  )}

                  {onQuickSim && !done && (
                    <button
                      onClick={() => onQuickSim(m)}
                      disabled={!ready}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-elevated border border-line hover:border-amber-400 text-amber-300 text-xs rounded-lg disabled:opacity-40 transition-colors"
                      title="Simulate a result"
                    >
                      <Zap size={13} /> Quick sim
                    </button>
                  )}

                  {onManageMatch && (
                    <button
                      onClick={() => onManageMatch(m)}
                      className="flex items-center gap-1 px-2 py-1.5 bg-elevated border border-line hover:border-primary text-gray-custom hover:text-foreground text-xs rounded-lg transition-colors"
                      title="Manage match — reassign teams, walkover, un-publish"
                    >
                      <SlidersHorizontal size={13} />
                    </button>
                  )}

                  <button
                    onClick={() => onOpenMatch(m)}
                    disabled={!ready}
                    className="flex items-center gap-1 px-3 py-1.5 bg-primary hover:bg-primary-dark text-on-primary text-xs font-semibold rounded-lg disabled:opacity-40"
                  >
                    {m.status === 'PUBLISHED' ? <CheckCircle2 size={13} /> : <Play size={13} />}
                    {m.status === 'SCHEDULED' ? 'Track' : m.status === 'PUBLISHED' ? 'View' : done ? 'View' : 'Resume'}
                  </button>
                  </div>
                  <div className={`text-[11px] flex items-center gap-1.5 ${when ? 'text-gray-custom' : 'text-gray-custom/60'}`}>
                    <CalendarClock size={11} className="shrink-0" /> {when ?? 'Unscheduled'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
