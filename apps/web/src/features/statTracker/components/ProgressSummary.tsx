import { useMemo } from 'react';
import { Trophy, CalendarClock, ListChecks } from 'lucide-react';
import type { TrackerSession } from '../types';
import { teamNames, DONE, stageSort, isBye } from './helpers';
import { STAGE_LABEL } from '../engine';

/** Top-of-tournament snapshot: completion, current stage, per-stage progress,
 *  and a champion banner once the final is decided. */
export default function ProgressSummary({ session }: { session: TrackerSession }) {
  const name = teamNames(session);

  const { total, played, byStage, currentStage, championId } = useMemo(() => {
    // Byes are auto-resolved, not matches anyone plays — exclude from counts.
    const realMatches = session.matches.filter((m) => !isBye(m));
    const total = realMatches.length;
    const played = realMatches.filter(DONE).length;

    const stages = new Map<string, { total: number; done: number }>();
    realMatches.forEach((m) => {
      const s = stages.get(m.stage) ?? { total: 0, done: 0 };
      s.total++;
      if (DONE(m)) s.done++;
      stages.set(m.stage, s);
    });
    const byStage = [...stages.entries()].sort((a, b) => stageSort(a[0], b[0]));

    // Current stage = earliest stage that still has an unfinished, playable match.
    const ordered = [...session.matches].sort((a, b) => stageSort(a.stage, b.stage) || a.orderIndex - b.orderIndex);
    const next = ordered.find((m) => !DONE(m) && m.homeTeamId && m.awayTeamId);
    const currentStage = next?.stage ?? (played === total ? 'done' : ordered.find((m) => !DONE(m))?.stage ?? 'done');

    const final = session.matches.find((m) => m.stage === 'final');
    const championId =
      final && DONE(final) && final.homeScore !== final.awayScore
        ? final.homeScore > final.awayScore ? final.homeTeamId : final.awayTeamId
        : null;

    return { total, played, byStage, currentStage, championId };
  }, [session]);

  const pctDone = total ? Math.round((played / total) * 100) : 0;
  const stageLabel = (s: string) =>
    s === 'done' ? 'Complete' : s === 'group' ? 'Group stage' : STAGE_LABEL[s] ?? s;

  return (
    <div className="space-y-4">
      {championId && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-amber-400/40 bg-amber-400/10">
          <Trophy size={22} className="text-amber-300 shrink-0" />
          <div>
            <p className="text-[11px] uppercase tracking-wide text-amber-300/80">Champion</p>
            <p className="text-lg font-bold">{name(championId)}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Tile icon={<ListChecks size={15} />} label="Matches played" value={`${played} / ${total}`} />
        <Tile icon={<CalendarClock size={15} />} label="Current stage" value={stageLabel(currentStage)} />
      </div>

      <div className="bg-card rounded-xl border border-line p-4">
        <div className="flex items-center justify-between text-xs text-gray-custom mb-1.5">
          <span>Tournament progress</span>
          <span>{pctDone}%</span>
        </div>
        <div className="h-2 rounded-full bg-elevated overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pctDone}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {byStage.map(([stage, s]) => {
            const complete = s.done === s.total;
            return (
              <span
                key={stage}
                className={`text-[11px] px-2 py-1 rounded-full border ${
                  complete
                    ? 'bg-primary/15 text-primary-light border-primary/30'
                    : s.done > 0
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                    : 'bg-elevated text-gray-custom border-line'
                }`}
              >
                {stageLabel(stage)} · {s.done}/{s.total}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Tile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-card rounded-xl border border-line p-4">
      <div className="flex items-center gap-1.5 text-gray-custom text-xs mb-1">{icon}{label}</div>
      <p className="text-lg font-bold truncate">{value}</p>
    </div>
  );
}
