import { useMemo, useState } from 'react';
import { LayoutDashboard, Table2, GitFork, ListOrdered, Zap, RotateCcw } from 'lucide-react';
import type { TrackerSession, TrackerMatch, GroupDef } from './types';
import { standingsFor } from './stats';
import { teamNames } from './components/helpers';
import { STAGE_LABEL } from './engine';
import ProgressSummary from './components/ProgressSummary';
import StatLeaders from './components/StatLeaders';
import StandingsTable from './components/StandingsTable';
import Bracket, { type BracketData, type BracketMatchVM } from './components/Bracket';
import FixturesList from './components/FixturesList';
import MatchDetails from './components/MatchDetails';

/** Adapt a live TrackerSession's bracket into the shared Bracket's plain props. */
function bracketDataFromSession(session: TrackerSession): BracketData {
  const b = session.bracket!;
  const mainStages = b.stages.filter((s) => s !== 'third_place');
  const slotsByStage: Record<string, string[]> = {};
  mainStages.forEach((s) => { slotsByStage[s] = b.slots.filter((x) => x.stage === s).map((x) => x.id); });
  const matchBySlot: Record<string, BracketMatchVM | undefined> = {};
  session.matches.forEach((m) => {
    if (!m.bracketSlot) return;
    matchBySlot[m.bracketSlot] = {
      id: m.id, slotId: m.bracketSlot, stage: m.stage,
      homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId,
      homeScore: m.homeScore, awayScore: m.awayScore, status: m.status,
    };
  });
  const tp = b.slots.find((s) => s.stage === 'third_place');
  return {
    stages: mainStages,
    slotsByStage,
    matchBySlot,
    thirdPlaceSlotId: b.includesThirdPlace && tp ? tp.id : null,
    teamName: teamNames(session),
    stageLabel: (s) => STAGE_LABEL[s] ?? s,
  };
}

type TabKey = 'overview' | 'standings' | 'bracket' | 'fixtures';

export interface DemoControls {
  onQuickSim: (m: TrackerMatch) => void;
  onSimAll: () => void;
  onReset: () => void;
}

/** The complete tournament manager view — shared by the real admin dashboard and
 *  the demo sandbox so both stay identical. Progression itself lives elsewhere
 *  (server for real sessions, engine.ts for the demo). */
export default function TournamentView({
  session,
  onOpenMatch,
  demo,
}: {
  session: TrackerSession;
  onOpenMatch: (m: TrackerMatch) => void;
  demo?: DemoControls;
}) {
  const hasBracket = !!session.bracket;
  const hasStandings = session.format === 'LEAGUE' || session.format === 'MIXED';
  const [detail, setDetail] = useState<TrackerMatch | null>(null);

  const tabs = useMemo(
    () =>
      [
        { key: 'overview' as const, label: 'Overview', icon: LayoutDashboard, show: true },
        { key: 'standings' as const, label: 'Standings', icon: Table2, show: hasStandings },
        { key: 'bracket' as const, label: 'Bracket', icon: GitFork, show: hasBracket },
        { key: 'fixtures' as const, label: 'Fixtures & results', icon: ListOrdered, show: true },
      ].filter((t) => t.show),
    [hasStandings, hasBracket],
  );
  const [tab, setTab] = useState<TabKey>('overview');
  const activeTab = tabs.some((t) => t.key === tab) ? tab : 'overview';

  return (
    <div className="space-y-5">
      {demo && (
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-amber-500/30 bg-amber-500/5">
          <span className="text-xs text-amber-300 mr-auto">
            Demo tools — simulate matches to watch the tournament advance.
          </span>
          <button
            onClick={demo.onSimAll}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-elevated border border-line hover:border-amber-400 text-amber-300 text-xs rounded-lg transition-colors"
          >
            <Zap size={13} /> Sim next round
          </button>
          <button
            onClick={demo.onReset}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-elevated border border-line hover:border-primary text-xs rounded-lg transition-colors"
          >
            <RotateCcw size={13} /> Reset
          </button>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-line overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                active ? 'border-primary text-foreground' : 'border-transparent text-gray-custom hover:text-foreground'
              }`}
            >
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <ProgressSummary session={session} />
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-custom mb-3">Stat leaders</h3>
            <StatLeaders session={session} />
          </div>
        </div>
      )}

      {activeTab === 'standings' && <StandingsSection session={session} />}

      {activeTab === 'bracket' && (
        <Bracket
          {...bracketDataFromSession(session)}
          onOpenMatch={(vm) => { const m = session.matches.find((x) => x.id === vm.id); if (m) onOpenMatch(m); }}
          onShowDetails={(vm) => { const m = session.matches.find((x) => x.id === vm.id); if (m) setDetail(m); }}
        />
      )}

      {activeTab === 'fixtures' && (
        <FixturesList
          session={session}
          onOpenMatch={onOpenMatch}
          onShowDetails={setDetail}
          onQuickSim={demo?.onQuickSim}
        />
      )}

      {detail && <MatchDetails session={session} match={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function StandingsSection({ session }: { session: TrackerSession }) {
  if (session.format === 'LEAGUE') {
    const teamIds = (session.roster ?? []).map((t) => t.teamId);
    return <StandingsTable title="League table" rows={standingsFor(session, teamIds)} />;
  }
  const advance = session.config?.advancePerGroup;
  return (
    <div className="grid md:grid-cols-2 gap-5">
      {(session.groups ?? []).map((g: GroupDef) => (
        <StandingsTable key={g.id} title={g.name} rows={standingsFor(session, g.teamIds)} advanceCount={advance} />
      ))}
    </div>
  );
}
