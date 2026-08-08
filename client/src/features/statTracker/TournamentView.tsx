import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { LayoutDashboard, Table2, GitFork, ListOrdered, Zap, RotateCcw } from 'lucide-react';
import api from '../../api/client';
import type { TrackerSession, TrackerMatch, GroupDef } from './types';
import { standingsFor } from './stats';
import { tournamentLeaders, type PublishedMatchStats } from './leaders';
import { teamNames } from './components/helpers';
import { STAGE_LABEL } from './engine';
import ProgressSummary from './components/ProgressSummary';
import StatLeaders from './components/StatLeaders';
import StandingsTable from './components/StandingsTable';
import Bracket, { type BracketData, type BracketMatchVM } from './components/Bracket';
import FixturesList from './components/FixturesList';
import MatchDetails from './components/MatchDetails';
import MatchAdminModal from './components/MatchAdminModal';
import AutoScheduleModal from './components/AutoScheduleModal';
import GroupEditor from './components/GroupEditor';
import { Pencil, AlertTriangle, Crown, Lock } from 'lucide-react';
import { TeamCrest } from '../../components/Avatar';
import RosterEditorModal from '../tournaments/RosterEditorModal';
import BoxScoreModal from '../tournaments/BoxScoreModal';

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
  const qc = useQueryClient();
  const hasBracket = !!session.bracket;
  const hasStandings = session.format === 'LEAGUE' || session.format === 'MIXED';
  const [detail, setDetail] = useState<TrackerMatch | null>(null);
  const [manage, setManage] = useState<TrackerMatch | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showGroups, setShowGroups] = useState(false);
  const [editTeam, setEditTeam] = useState<any | null>(null);
  // Fixture whose box score is being typed in — for a match that was played but
  // never tracked. Publishing it produces the same result, per-player stats and
  // ranking update a live-tracked match would have.
  const [boxScore, setBoxScore] = useState<TrackerMatch | null>(null);

  // Registered teams + roster status — so an organiser can manage rosters right
  // here on the tracker, without bouncing back to the manage hub. Same endpoint
  // + summary flags (rosterLocked / needsAttention) the manage page uses; edits
  // reuse the one RosterEditorModal and are server-enforced by tournament access.
  const { data: regData } = useQuery({
    queryKey: ['admin-tournament-registrations', session.tournamentId],
    queryFn: async () => (await api.get(`/tournaments/${session.tournamentId}/registrations`)).data,
    enabled: !demo,
  });
  const registrations: any[] = regData?.registrations ?? [];

  // Late entries: teams registered AFTER this draw was generated. They aren't in
  // any group yet, so surface them here (not just buried in the group editor) so
  // an organiser is never unaware a registered team is unplaced. Group formats
  // fix it in the editor; a group-less draw needs a reset to include them.
  const hasGroups = (session.groups ?? []).length > 0;
  const { data: liveTeams } = useQuery({
    queryKey: ['tournament-teams-live', session.tournamentId],
    queryFn: async () => (await api.get(`/tournaments/${session.tournamentId}`)).data.tournament?.teams ?? [],
    enabled: !demo,
  });
  const registeredIds: string[] = (liveTeams ?? []).map((t: any) => t.team.id);
  // A team is PLACED if it sits in a group OR appears in any match (home/away).
  // Checking groups alone falsely flagged every team in a group-less draw
  // (knockout) as "unplaced". Late entries are the registered teams in neither.
  const placedTeamIds = new Set<string>();
  for (const g of (session.groups ?? []) as Array<{ teamIds: string[] }>) {
    for (const id of g.teamIds ?? []) placedTeamIds.add(id);
  }
  for (const m of session.matches ?? []) {
    if (m.homeTeamId) placedTeamIds.add(m.homeTeamId);
    if (m.awayTeamId) placedTeamIds.add(m.awayTeamId);
  }
  const lateTeamIds = demo ? [] : registeredIds.filter((id) => !placedTeamIds.has(id));

  // Stat leaders come from BOTH sources at once: every published match's stat
  // rows (tracked publishes, box scores against a fixture, and standalone box
  // scores that were never fixtures at all) plus the tracker's own live state for
  // anything completed but not yet published. tournamentLeaders reconciles them
  // per match, so a published result is counted once and nothing is missed.
  // The offline demo never hits the server — its matches carry their own state.
  const { data: publishedStats } = useQuery({
    queryKey: ['tournament-match-stats', session.tournamentId],
    queryFn: async () =>
      (await api.get(`/tournaments/${session.tournamentId}/match-stats`)).data.matches as PublishedMatchStats[],
    enabled: !demo,
  });
  const leaderCategories = useMemo(
    () => tournamentLeaders(session, 5, publishedStats ?? []),
    [session, publishedStats],
  );

  // Re-seed the knockout from the group tables as they stand now. Offered only
  // while the bracket is still a prediction: once a knockout tie has been played,
  // re-drawing would orphan a real result, and the server refuses it too.
  const knockoutMatches = (session.matches ?? []).filter((m) => m.stage !== 'group' && m.stage !== 'league');
  const groupStage = (session.matches ?? []).filter((m) => m.stage === 'group');
  const canReseed = !demo
    && knockoutMatches.length > 0
    && groupStage.length > 0
    && groupStage.every((m) => m.status === 'COMPLETED' || m.status === 'PUBLISHED')
    // A bye is COMPLETED with one side empty — not a tie anyone played.
    && !knockoutMatches.some((m) => m.publishedMatchId
      || (['COMPLETED', 'PUBLISHED', 'IN_PROGRESS'].includes(m.status) && m.homeTeamId && m.awayTeamId));

  const reseed = useMutation({
    mutationFn: () => api.post(`/tracker/sessions/${session.tournamentId}/reseed-knockout`),
    onSuccess: (res: any) => {
      const changed = res.data?.changed ?? 0;
      toast.success(changed > 0
        ? `Bracket re-seeded — ${changed} tie${changed === 1 ? '' : 's'} changed`
        : 'Bracket re-seeded — the standings already matched');
      qc.invalidateQueries({ queryKey: ['tracker-session', session.tournamentId] });
      qc.invalidateQueries({ queryKey: ['tournament-fixtures', session.tournamentId] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Could not re-seed the bracket'),
  });

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

      {lateTeamIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-amber-500/40 bg-amber-500/10">
          <AlertTriangle size={14} className="text-amber-300 shrink-0" />
          <span className="text-xs text-amber-200 mr-auto">
            {lateTeamIds.length} team{lateTeamIds.length === 1 ? '' : 's'} registered after the draw and {lateTeamIds.length === 1 ? "isn't" : "aren't"} placed yet.
            {hasGroups ? ' Add them to a group, or reset the draw.' : ' Reset the draw to include them.'}
          </span>
          {hasGroups && (
            <button
              onClick={() => setShowGroups(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-elevated border border-line hover:border-amber-400 text-amber-200 text-xs rounded-lg transition-colors"
            >
              <Pencil size={13} /> Place teams
            </button>
          )}
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

          {/* Registered teams — manage rosters without leaving the tracker */}
          {!demo && registrations.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-custom">Registered teams</h3>
                <span className="text-xs text-gray-custom">{registrations.length}</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {registrations.map((r) => (
                  <div key={r.id} className="flex items-center gap-2.5 p-3 rounded-xl border border-line bg-ink/[0.03]">
                    <TeamCrest name={r.team.name} src={r.team.logo} size={34} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate flex items-center gap-1.5">
                        {r.team.captain && <Crown size={11} className="text-primary shrink-0" />}{r.team.name}
                      </p>
                      <p className="text-[11px] text-gray-custom">{r.summary.accepted} player{r.summary.accepted === 1 ? '' : 's'}</p>
                    </div>
                    {r.summary.rosterLocked && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full shrink-0 bg-ink/10 text-gray-custom flex items-center gap-1"><Lock size={9} /> Locked</span>
                    )}
                    {r.summary.needsAttention && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full shrink-0 bg-amber-500/20 text-amber-300">
                        {r.summary.accepted === 0 ? 'Needs players' : 'Below min'}
                      </span>
                    )}
                    <button
                      onClick={() => setEditTeam({ ...r.team, _locked: r.summary.rosterLocked })}
                      className="text-xs font-medium text-primary-light hover:underline shrink-0"
                    >
                      {r.summary.rosterLocked ? 'View' : 'Edit'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-custom mb-3">Stat leaders</h3>
            <StatLeaders categories={leaderCategories} />
          </div>
        </div>
      )}

      {activeTab === 'standings' && <StandingsSection session={session} onEditGroups={demo ? undefined : () => setShowGroups(true)} />}

      {activeTab === 'bracket' && (
        <div className="space-y-3">
          {canReseed && (
            <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-line bg-ink/[0.03]">
              <span className="text-xs text-gray-custom mr-auto">
                Seeded from the group standings when the group stage finished. Re-seed if
                those standings have since been corrected.
              </span>
              <button
                onClick={() => {
                  if (!confirm('Re-seed the knockout from the current group standings? The bracket is redrawn from the tables as they stand now.')) return;
                  reseed.mutate();
                }}
                disabled={reseed.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-elevated border border-line hover:border-primary text-xs rounded-lg transition-colors disabled:opacity-50"
              >
                <RotateCcw size={13} /> {reseed.isPending ? 'Re-seeding…' : 'Re-seed from standings'}
              </button>
            </div>
          )}
          <Bracket
            {...bracketDataFromSession(session)}
            onOpenMatch={(vm) => { const m = session.matches.find((x) => x.id === vm.id); if (m) onOpenMatch(m); }}
            onShowDetails={(vm) => { const m = session.matches.find((x) => x.id === vm.id); if (m) setDetail(m); }}
          />
        </div>
      )}

      {activeTab === 'fixtures' && (
        <FixturesList
          session={session}
          onOpenMatch={onOpenMatch}
          onShowDetails={setDetail}
          onQuickSim={demo?.onQuickSim}
          onManageMatch={demo ? undefined : setManage}
          onBoxScore={demo ? undefined : setBoxScore}
          onAutoSchedule={demo ? undefined : () => setShowSchedule(true)}
        />
      )}

      {detail && <MatchDetails session={session} match={detail} onClose={() => setDetail(null)} />}
      {manage && <MatchAdminModal session={session} match={manage} onClose={() => setManage(null)} />}
      {showSchedule && <AutoScheduleModal tournamentId={session.tournamentId} sport={session.sport} onClose={() => setShowSchedule(false)} />}
      {showGroups && <GroupEditor session={session} onClose={() => setShowGroups(false)} />}
      {editTeam && <RosterEditorModal tournamentId={session.tournamentId} team={editTeam} onClose={() => setEditTeam(null)} />}
      {boxScore && (
        <BoxScoreModal
          tournamentId={session.tournamentId}
          sport={session.sport}
          // Teams and rosters are loaded from the fixture itself, so the picker
          // list this prop feeds isn't used in fixture mode.
          teams={[]}
          trackerMatchId={boxScore.id}
          onClose={() => setBoxScore(null)}
        />
      )}
    </div>
  );
}

function StandingsSection({ session, onEditGroups }: { session: TrackerSession; onEditGroups?: () => void }) {
  if (session.format === 'LEAGUE') {
    const teamIds = (session.roster ?? []).map((t) => t.teamId);
    return <StandingsTable title="League table" rows={standingsFor(session, teamIds)} />;
  }
  const advance = session.config?.advancePerGroup;
  return (
    <div className="space-y-4">
      {onEditGroups && (
        <div className="flex justify-end">
          <button
            onClick={onEditGroups}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-card border border-line hover:border-primary text-xs font-medium rounded-lg transition-colors"
          >
            <Pencil size={13} /> Edit groups
          </button>
        </div>
      )}
      <div className="grid md:grid-cols-2 gap-5">
        {(session.groups ?? []).map((g: GroupDef) => (
          <StandingsTable key={g.id} title={g.name} rows={standingsFor(session, g.teamIds)} advanceCount={advance} />
        ))}
      </div>
    </div>
  );
}
