import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import BallLoader from '../../components/BallLoader';
import { GitFork, Settings } from 'lucide-react';
import StandingsTable from '../statTracker/components/StandingsTable';
import SharedBracket, { type BracketData, type BracketMatchVM } from '../statTracker/components/Bracket';
import type { StandingRow } from '../statTracker/stats';
import { fmtSchedule } from '../statTracker/schedule';
import { CalendarClock } from 'lucide-react';

// ── types ─────────────────────────────────────────────────────────────────────
interface TeamLite { id: string; name: string; logo: string | null }
interface Standing {
  teamId: string; played: number; wins: number; draws: number; losses: number;
  goalsFor: number; goalsAgainst: number; goalDifference: number; points: number;
}
interface BMatch {
  id: string; stage: string; round: string | null; groupId: string | null;
  bracketSlot: string | null; feedsInto: string | null;
  homeTeamId: string | null; awayTeamId: string | null;
  homeScore: number | null; awayScore: number | null; status: string;
  scheduledAt: string | null; court: string | null;
  winnerTeamId: string | null;
}
interface Group { id: string; name: string; teamIds: string[]; standings: Standing[]; matches: BMatch[] }
interface FixturesResponse {
  hasBracket: boolean;
  format: 'LEAGUE' | 'KNOCKOUT' | 'MIXED' | null;
  teams: Record<string, TeamLite>;
  groups: Group[] | null;
  bracket: { rounds: { stage: string; title: string; matches: BMatch[] }[]; thirdPlace: BMatch | null } | null;
  advancingTeamIds?: string[];
  flatMatches: BMatch[] | null;
}

const FORMAT_LABEL: Record<string, string> = {
  LEAGUE: 'League', KNOCKOUT: 'Knockout', MIXED: 'Group stage + Knockout',
};

export default function TournamentFixtures({ tournamentId, isAdmin }: { tournamentId: string; sport: string; isAdmin: boolean }) {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useQuery<FixturesResponse>({
    queryKey: ['tournament-fixtures', tournamentId],
    queryFn: async () => (await api.get(`/tournaments/${tournamentId}/fixtures`)).data,
  });

  if (isLoading) return <div className="flex justify-center py-16"><BallLoader /></div>;
  if (isError || !data) {
    return <div className="bg-card rounded-xl border border-line p-12 text-center text-sm text-gray-custom">Couldn't load fixtures.</div>;
  }

  const teams = data.teams;
  const AdminBtn = isAdmin ? (
    <button
      onClick={() => navigate(`/admin/stat-tracker/${tournamentId}`)}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-surface hover:bg-elevated border border-line text-xs font-medium rounded-lg transition-colors"
    >
      <Settings size={13} /> Manage fixtures
    </button>
  ) : null;

  // ── No tracker session: flat list or empty state ────────────────────────────
  if (!data.hasBracket) {
    const flat = data.flatMatches ?? [];
    if (flat.length === 0) {
      return (
        <div className="bg-card rounded-xl border border-line p-10 sm:p-12 text-center">
          <GitFork size={28} className="mx-auto mb-3 text-gray-custom" />
          <h3 className="text-base font-semibold mb-1.5">Fixtures not published yet</h3>
          <p className="text-sm text-gray-custom max-w-sm mx-auto mb-5">
            The schedule and bracket for this tournament haven't been set up.
            {isAdmin ? ' Set up groups and a knockout bracket in the tracker.' : ' Check back soon.'}
          </p>
          {AdminBtn}
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Matches</h2>
          {AdminBtn}
        </div>
        <div className="bg-card rounded-xl border border-line divide-y divide-line">
          {flat.map((m) => <FlatRow key={m.id} m={m} teams={teams} />)}
        </div>
      </div>
    );
  }

  const advancing = new Set(data.advancingTeamIds ?? []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-primary/15 text-primary">
          {data.format ? FORMAT_LABEL[data.format] : 'Fixtures'}
        </span>
        {AdminBtn}
      </div>

      {/* Group stage */}
      {data.groups && data.groups.length > 0 && (
        <div className="space-y-4">
          <SectionTitle>Group stage</SectionTitle>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {data.groups.map((g) => <GroupCard key={g.id} group={g} teams={teams} advancing={advancing} />)}
          </div>
        </div>
      )}

      {/* Knockout bracket */}
      {data.bracket && (
        <div className="space-y-4">
          <SectionTitle>Knockout</SectionTitle>
          <div className="bg-card rounded-xl border border-line p-4 sm:p-6">
            <SharedBracket {...bracketDataFromEndpoint(data.bracket, teams)} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── shared bits ───────────────────────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-custom">{children}</h2>;
}
function TeamChip({ team, size = 18 }: { team?: TeamLite; size?: number }) {
  if (!team) return <span className="text-gray-custom italic">TBD</span>;
  return (
    <span className="flex items-center gap-2 min-w-0">
      {team.logo
        ? <img src={team.logo} alt="" className="rounded object-cover shrink-0 border border-line" style={{ width: size, height: size }} />
        : <span className="rounded bg-elevated flex items-center justify-center text-[9px] font-bold text-gray-custom shrink-0" style={{ width: size, height: size }}>{team.name.charAt(0).toUpperCase()}</span>}
      <span className="truncate">{team.name}</span>
    </span>
  );
}
function isPlayed(m: BMatch) { return m.status === 'COMPLETED' || m.status === 'PUBLISHED'; }

// ── group standings + fixtures ─────────────────────────────────────────────────
function GroupCard({ group, teams, advancing }: { group: Group; teams: Record<string, TeamLite>; advancing: Set<string> }) {
  // Qualifier highlight only when advancement is selective (some group team doesn't advance).
  const advCount = group.teamIds.filter((id) => advancing.has(id)).length;
  const selective = advCount > 0 && advCount < group.teamIds.length;
  const rows: StandingRow[] = group.standings.map((s) => ({ ...s, teamName: teams[s.teamId]?.name ?? 'TBD' }));
  return (
    <div className="space-y-3">
      <StandingsTable title={group.name} rows={rows} advanceCount={selective ? advCount : undefined} />
      {group.matches.length > 0 && (
        <div className="bg-card rounded-xl border border-line overflow-hidden divide-y divide-line/60">
          {group.matches.map((m) => <FlatRow key={m.id} m={m} teams={teams} compact />)}
        </div>
      )}
    </div>
  );
}

// ── flat match row (group fixtures + fallback list) ────────────────────────────
function FlatRow({ m, teams, compact }: { m: BMatch; teams: Record<string, TeamLite>; compact?: boolean }) {
  const played = isPlayed(m);
  const homeWin = played && m.homeScore != null && m.awayScore != null && m.homeScore > m.awayScore;
  const awayWin = played && m.homeScore != null && m.awayScore != null && m.awayScore > m.homeScore;
  const when = fmtSchedule(m.scheduledAt, m.court);
  const sub = when ?? (played ? null : 'Time TBC');
  return (
    <div className={`px-4 ${compact ? 'py-2' : 'py-2.5'} space-y-1`}>
      <div className="flex items-center gap-3 text-sm">
        {!compact && m.round && <span className="text-xs text-gray-custom w-24 shrink-0 truncate">{m.round}</span>}
        <div className={`flex-1 min-w-0 ${homeWin ? 'font-semibold' : 'text-gray-custom'}`}><TeamChip team={teams[m.homeTeamId ?? '']} size={18} /></div>
        <div className="font-numeric tabular-nums text-sm shrink-0 px-2">
          {played ? <span><span className={homeWin ? 'text-primary' : ''}>{m.homeScore}</span><span className="text-gray-custom mx-1">–</span><span className={awayWin ? 'text-primary' : ''}>{m.awayScore}</span></span> : <span className="text-gray-custom text-xs">vs</span>}
        </div>
        <div className={`flex-1 min-w-0 flex justify-end text-right ${awayWin ? 'font-semibold' : 'text-gray-custom'}`}>
          <span className="flex items-center gap-2 min-w-0 flex-row-reverse">
            {teams[m.awayTeamId ?? '']
              ? <>
                  {teams[m.awayTeamId!].logo
                    ? <img src={teams[m.awayTeamId!].logo!} alt="" className="w-[18px] h-[18px] rounded object-cover shrink-0 border border-line" />
                    : <span className="w-[18px] h-[18px] rounded bg-elevated flex items-center justify-center text-[9px] font-bold text-gray-custom shrink-0">{teams[m.awayTeamId!].name.charAt(0).toUpperCase()}</span>}
                  <span className="truncate">{teams[m.awayTeamId!].name}</span>
                </>
              : <span className="text-gray-custom italic">TBD</span>}
          </span>
        </div>
      </div>
      {sub && (
        <div className={`text-[11px] flex items-center gap-1.5 ${compact ? '' : 'pl-24'} ${when ? 'text-gray-custom' : 'text-gray-custom/60'}`}>
          <CalendarClock size={11} className="shrink-0" /> {sub}
        </div>
      )}
    </div>
  );
}

// ── adapt the /fixtures endpoint's bracket into the shared Bracket's props ──────
function bracketDataFromEndpoint(
  bracket: NonNullable<FixturesResponse['bracket']>,
  teams: Record<string, TeamLite>,
): BracketData {
  const slotsByStage: Record<string, string[]> = {};
  const matchBySlot: Record<string, BracketMatchVM | undefined> = {};
  const titleByStage: Record<string, string> = {};
  const add = (m: BMatch): string => {
    const slotId = m.bracketSlot ?? m.id;
    matchBySlot[slotId] = {
      id: m.id, slotId, stage: m.stage,
      homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId,
      homeScore: m.homeScore, awayScore: m.awayScore, status: m.status,
    };
    return slotId;
  };
  bracket.rounds.forEach((r) => {
    titleByStage[r.stage] = r.title;
    slotsByStage[r.stage] = r.matches.map(add);
  });
  const thirdPlaceSlotId = bracket.thirdPlace ? add(bracket.thirdPlace) : null;
  return {
    stages: bracket.rounds.map((r) => r.stage),
    slotsByStage,
    matchBySlot,
    thirdPlaceSlotId,
    teamName: (id) => (id && teams[id] ? teams[id].name : 'TBD'),
    teamLogo: (id) => (id && teams[id] ? teams[id].logo : null),
    stageLabel: (s) => titleByStage[s] ?? s,
  };
}
