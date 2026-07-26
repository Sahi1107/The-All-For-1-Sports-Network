import { Play, Trophy, BarChart3 } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Shared, presentational knockout bracket — used by BOTH the admin TournamentView
// (fed from a TrackerSession, with Track/Resume/Details callbacks) and the public
// tournament page (fed from the /fixtures endpoint, no callbacks). Plain data in;
// admin actions only render when the callbacks are supplied.
// ─────────────────────────────────────────────────────────────────────────────

export interface BracketMatchVM {
  id: string;                 // underlying match id (tracker match id — used by admin actions)
  slotId: string;
  stage: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScore: number | null;
  awayScore: number | null;
  status: string;             // SCHEDULED | IN_PROGRESS | COMPLETED | PUBLISHED
}

export interface BracketData {
  stages: string[];                          // ordered main stages, excluding third_place
  slotsByStage: Record<string, string[]>;    // stage -> ordered slot ids
  matchBySlot: Record<string, BracketMatchVM | undefined>;
  thirdPlaceSlotId: string | null;
  teamName: (id: string | null) => string;
  stageLabel: (stage: string) => string;
  teamLogo?: (id: string | null) => string | null | undefined; // optional crest (public supplies it)
}

export interface BracketProps extends BracketData {
  onOpenMatch?: (m: BracketMatchVM) => void;
  onShowDetails?: (m: BracketMatchVM) => void;
  connectors?: boolean; // draw the connector tree (default true)
}

const CW = 30; // connector column width (px)
const isDone = (s?: string) => s === 'COMPLETED' || s === 'PUBLISHED';
const winnerId = (m?: BracketMatchVM): string | null =>
  m && isDone(m.status) && m.homeTeamId && m.awayTeamId && m.homeScore != null && m.awayScore != null && m.homeScore !== m.awayScore
    ? (m.homeScore > m.awayScore ? m.homeTeamId : m.awayTeamId)
    : null;

export default function Bracket({
  stages, slotsByStage, matchBySlot, thirdPlaceSlotId, teamName, stageLabel, teamLogo,
  onOpenMatch, onShowDetails, connectors = true,
}: BracketProps) {
  if (stages.length === 0) {
    return <div className="text-sm text-gray-custom">No knockout bracket for this format.</div>;
  }

  const finalStage = stages[stages.length - 1];
  const finalSlot = (slotsByStage[finalStage] ?? [])[0];
  const championId = winnerId(finalSlot ? matchBySlot[finalSlot] : undefined);

  return (
    <div className="space-y-5">
      {championId && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-amber-400/40 bg-amber-400/10">
          <Trophy size={22} className="text-amber-300 shrink-0" />
          <div>
            <p className="text-[11px] uppercase tracking-wide text-amber-300/80">Champion</p>
            <p className="text-lg font-bold">{teamName(championId)}</p>
          </div>
        </div>
      )}

      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-max">
          {stages.map((stage, si) => {
            const slots = slotsByStage[stage] ?? [];
            const last = si === stages.length - 1;
            return (
              <div key={stage} className="flex flex-col" style={{ minWidth: 200 }}>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-custom text-center pb-3">
                  {stageLabel(stage)}
                </div>
                <div className="flex-1 flex flex-col">
                  {slots.map((slotId, mi) => {
                    const isTop = mi % 2 === 0;
                    const hasPartner = isTop ? mi + 1 < slots.length : true;
                    return (
                      <div key={slotId} className="flex-1 flex items-stretch">
                        <div className="flex-1 flex items-center px-1">
                          <SlotCard
                            vm={matchBySlot[slotId]}
                            teamName={teamName}
                            teamLogo={teamLogo}
                            champion={last}
                            onOpenMatch={onOpenMatch}
                            onShowDetails={onShowDetails}
                          />
                        </div>
                        {!last && connectors && <Connector isTop={isTop} hasPartner={hasPartner} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {thirdPlaceSlotId && (
        <div className="pt-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-custom mb-2">Third-place playoff</div>
          <div className="max-w-[240px]">
            <SlotCard vm={matchBySlot[thirdPlaceSlotId]} teamName={teamName} teamLogo={teamLogo} onOpenMatch={onOpenMatch} onShowDetails={onShowDetails} />
          </div>
        </div>
      )}
    </div>
  );
}

// connector tree (ported from the public bracket): stub out of each match →
// vertical joining the pair → stub into the next round's centered match.
function Connector({ isTop, hasPartner }: { isTop: boolean; hasPartner: boolean }) {
  return (
    <div className="relative shrink-0" style={{ width: CW }}>
      <div className="absolute top-1/2 left-0 h-0.5 bg-gray-custom/40" style={{ width: CW / 2 }} />
      {hasPartner && (
        <div className="absolute w-0.5 bg-gray-custom/40" style={{ left: CW / 2, ...(isTop ? { top: '50%', bottom: 0 } : { top: 0, height: '50%' }) }} />
      )}
      {isTop && hasPartner && <div className="absolute h-0.5 bg-gray-custom/40" style={{ left: CW / 2, right: 0, bottom: 0 }} />}
    </div>
  );
}

function SlotCard({
  vm, teamName, teamLogo, champion, onOpenMatch, onShowDetails,
}: {
  vm: BracketMatchVM | undefined;
  teamName: (id: string | null) => string;
  teamLogo?: (id: string | null) => string | null | undefined;
  champion?: boolean;
  onOpenMatch?: (m: BracketMatchVM) => void;
  onShowDetails?: (m: BracketMatchVM) => void;
}) {
  // Bye: an auto-resolved slot with a single team (the other side is null). Render
  // the lone team advancing with a "Bye" tag rather than a broken one-team match.
  const byeTeamId = vm && isDone(vm.status) && (!!vm.homeTeamId !== !!vm.awayTeamId)
    ? (vm.homeTeamId ?? vm.awayTeamId)
    : null;
  if (byeTeamId) {
    const logo = teamLogo?.(byeTeamId);
    return (
      <div className="w-full rounded-lg border border-line bg-surface overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-sm">
          <span className="flex items-center gap-1.5 min-w-0 font-medium">
            {logo && <img src={logo} alt="" className="w-[18px] h-[18px] rounded object-cover border border-line shrink-0" />}
            <span className="truncate">{teamName(byeTeamId)}</span>
          </span>
          <span className="text-[10px] uppercase tracking-wide text-gray-custom px-1.5 py-0.5 rounded bg-elevated shrink-0">Bye</span>
        </div>
      </div>
    );
  }

  const done = isDone(vm?.status);
  const live = vm?.status === 'IN_PROGRESS';
  const ready = !!vm?.homeTeamId && !!vm?.awayTeamId;
  const showScore = !!vm && vm.status !== 'SCHEDULED';
  const win = winnerId(vm);
  const homeWin = !!win && win === vm?.homeTeamId;
  const awayWin = !!win && win === vm?.awayTeamId;
  const hasActions = !!(onOpenMatch || onShowDetails);
  // Public (no actions): show the footer only when the match isn't finished — a
  // finished match's scoreline already says everything; avoids a redundant "Final".
  const showFooter = hasActions || !done;

  return (
    <div className="w-full rounded-lg border border-line bg-surface overflow-hidden">
      <Row name={vm ? teamName(vm.homeTeamId) : 'TBD'} logo={teamLogo?.(vm?.homeTeamId ?? null)} score={vm?.homeScore} show={showScore} winner={homeWin} champion={!!champion && homeWin} />
      <div className="h-px bg-line" />
      <Row name={vm ? teamName(vm.awayTeamId) : 'TBD'} logo={teamLogo?.(vm?.awayTeamId ?? null)} score={vm?.awayScore} show={showScore} winner={awayWin} champion={!!champion && awayWin} />

      {showFooter && (
        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 border-t border-line/70">
          <span className="text-[10px] flex items-center gap-1.5 text-gray-custom">
            {live && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
            <span className={live ? 'text-amber-300' : ''}>
              {!vm ? '—' : done ? 'Final' : live ? 'Live' : ready ? 'Scheduled' : 'Awaiting teams'}
            </span>
          </span>
          {vm && done && onShowDetails ? (
            <button onClick={() => onShowDetails(vm)} className="flex items-center gap-1 text-[11px] text-gray-custom hover:text-foreground">
              <BarChart3 size={11} /> Details
            </button>
          ) : vm && ready && !done && onOpenMatch ? (
            <button onClick={() => onOpenMatch(vm)} className="flex items-center gap-1 text-[11px] text-primary hover:text-primary-light">
              <Play size={11} /> {live ? 'Resume' : 'Track'}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Row({
  name, logo, score, show, winner, champion,
}: { name: string; logo?: string | null; score?: number | null; show: boolean; winner: boolean; champion: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-2 px-2.5 py-1.5 text-sm ${winner ? 'bg-primary/10' : ''}`}>
      <span className={`flex items-center gap-1.5 min-w-0 ${winner ? 'font-semibold text-foreground' : name === 'TBD' ? 'text-gray-custom italic' : ''}`}>
        {champion && <Trophy size={12} className="text-primary shrink-0" />}
        {logo && <img src={logo} alt="" className="w-[18px] h-[18px] rounded object-cover border border-line shrink-0" />}
        <span className="truncate">{name}</span>
      </span>
      <span className={`font-numeric tabular-nums shrink-0 ${winner ? 'text-primary font-semibold' : 'text-gray-custom'}`}>
        {show && score != null ? score : '–'}
      </span>
    </div>
  );
}
