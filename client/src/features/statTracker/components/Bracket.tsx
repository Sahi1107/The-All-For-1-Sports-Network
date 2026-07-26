import { Play, Trophy, BarChart3 } from 'lucide-react';
import type { TrackerSession, TrackerMatch } from '../types';
import { teamNames, DONE } from './helpers';
import { STAGE_LABEL } from '../engine';

/** Visual knockout bracket: one column per stage, slots matched to fixtures by
 *  `bracketSlot`. Winners are highlighted; the final winner gets a champion chip. */
export default function Bracket({
  session,
  onOpenMatch,
  onShowDetails,
}: {
  session: TrackerSession;
  onOpenMatch: (m: TrackerMatch) => void;
  onShowDetails: (m: TrackerMatch) => void;
}) {
  const bracket = session.bracket;
  if (!bracket) {
    return <div className="text-sm text-gray-custom">No knockout bracket for this format.</div>;
  }

  const name = teamNames(session);
  const bySlot = new Map<string, TrackerMatch>();
  session.matches.forEach((m) => { if (m.bracketSlot) bySlot.set(m.bracketSlot, m); });

  const mainStages = bracket.stages.filter((s) => s !== 'third_place');
  const finalMatch = session.matches.find((m) => m.stage === 'final');
  const championId =
    finalMatch && DONE(finalMatch) && finalMatch.homeScore !== finalMatch.awayScore
      ? finalMatch.homeScore > finalMatch.awayScore
        ? finalMatch.homeTeamId
        : finalMatch.awayTeamId
      : null;

  return (
    <div className="space-y-5">
      {championId && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-amber-400/40 bg-amber-400/10">
          <Trophy size={22} className="text-amber-300 shrink-0" />
          <div>
            <p className="text-[11px] uppercase tracking-wide text-amber-300/80">Champion</p>
            <p className="text-lg font-bold">{name(championId)}</p>
          </div>
        </div>
      )}

      <div className="overflow-x-auto pb-3">
        <div className="flex gap-6 min-w-fit">
          {mainStages.map((stage) => {
            const slots = bracket.slots.filter((s) => s.stage === stage);
            return (
              <div key={stage} className="flex flex-col justify-around gap-4 min-w-[210px]">
                <div className="text-[11px] uppercase tracking-wide text-gray-custom">
                  {STAGE_LABEL[stage] ?? stage}
                </div>
                {slots.map((slot) => (
                  <SlotCard
                    key={slot.id}
                    match={bySlot.get(slot.id)}
                    name={name}
                    onOpenMatch={onOpenMatch}
                    onShowDetails={onShowDetails}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {bracket.includesThirdPlace && (() => {
        const slot = bracket.slots.find((s) => s.stage === 'third_place');
        const m = slot ? bySlot.get(slot.id) : undefined;
        return (
          <div className="max-w-[240px]">
            <div className="text-[11px] uppercase tracking-wide text-gray-custom mb-2">Third-place playoff</div>
            <SlotCard match={m} name={name} onOpenMatch={onOpenMatch} onShowDetails={onShowDetails} />
          </div>
        );
      })()}
    </div>
  );
}

function SlotCard({
  match,
  name,
  onOpenMatch,
  onShowDetails,
}: {
  match: TrackerMatch | undefined;
  name: (id: string | null) => string;
  onOpenMatch: (m: TrackerMatch) => void;
  onShowDetails: (m: TrackerMatch) => void;
}) {
  const done = match ? DONE(match) : false;
  const ready = !!match?.homeTeamId && !!match?.awayTeamId;
  const homeWin = done && !!match && match.homeScore > match.awayScore;
  const awayWin = done && !!match && match.awayScore > match.homeScore;

  return (
    <div className="rounded-lg border border-line bg-card p-2.5">
      <Row name={match ? name(match.homeTeamId) : 'TBD'} score={match?.homeScore} show={!!match && match.status !== 'SCHEDULED'} winner={homeWin} />
      <div className="h-px bg-line my-1.5" />
      <Row name={match ? name(match.awayTeamId) : 'TBD'} score={match?.awayScore} show={!!match && match.status !== 'SCHEDULED'} winner={awayWin} />
      <div className="flex items-center justify-between mt-2">
        <span className="text-[10px] text-gray-custom">
          {!match ? '—' : done ? 'Final' : match.status === 'IN_PROGRESS' ? 'Live' : ready ? 'Scheduled' : 'Awaiting teams'}
        </span>
        {match && done ? (
          <button onClick={() => onShowDetails(match)} className="flex items-center gap-1 text-[11px] text-gray-custom hover:text-foreground">
            <BarChart3 size={11} /> Details
          </button>
        ) : match && ready ? (
          <button onClick={() => onOpenMatch(match)} className="flex items-center gap-1 text-[11px] text-primary hover:text-primary-light">
            <Play size={11} /> {match.status === 'IN_PROGRESS' ? 'Resume' : 'Track'}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Row({ name, score, show, winner }: { name: string; score?: number; show: boolean; winner: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm gap-2">
      <span className={`truncate ${winner ? 'font-semibold text-primary-light' : name === 'TBD' ? 'text-gray-custom' : ''}`}>{name}</span>
      <span className="font-mono text-gray-custom tabular-nums">{show && score !== undefined ? score : '—'}</span>
    </div>
  );
}
