import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import BallLoader from '../../components/BallLoader';
import { GitFork, Settings, Trophy, Medal } from 'lucide-react';

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
const CW = 30; // connector column width (px)

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
            <Bracket rounds={data.bracket.rounds} teams={teams} />
            {data.bracket.thirdPlace && <ThirdPlace m={data.bracket.thirdPlace} teams={teams} />}
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
  return (
    <div className="bg-card rounded-xl border border-line overflow-hidden">
      <div className="px-4 py-3 border-b border-line">
        <h3 className="text-sm font-semibold">{group.name}</h3>
      </div>
      {/* Standings */}
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-custom">
            <th className="text-left font-medium py-2 pl-4 pr-2">#</th>
            <th className="text-left font-medium py-2 pr-2">Team</th>
            {['P', 'W', 'D', 'L', 'GD'].map((h) => <th key={h} className="font-medium py-2 px-1.5 text-center w-7">{h}</th>)}
            <th className="font-medium py-2 px-2 text-center w-9">Pts</th>
          </tr>
        </thead>
        <tbody className="font-numeric">
          {group.standings.map((s, i) => {
            const qual = advancing.has(s.teamId);
            return (
              <tr key={s.teamId} className={`border-t border-line/60 ${qual ? 'bg-primary/5' : ''}`}>
                <td className="py-2 pl-4 pr-2">
                  <span className={`inline-flex items-center justify-center w-5 h-5 rounded text-[11px] font-semibold ${qual ? 'bg-primary text-on-primary' : 'text-gray-custom'}`}>{i + 1}</span>
                </td>
                <td className="py-2 pr-2 max-w-0">
                  <div className="text-foreground"><TeamChip team={teams[s.teamId]} size={16} /></div>
                </td>
                <td className="py-2 px-1.5 text-center tabular-nums text-gray-custom">{s.played}</td>
                <td className="py-2 px-1.5 text-center tabular-nums">{s.wins}</td>
                <td className="py-2 px-1.5 text-center tabular-nums">{s.draws}</td>
                <td className="py-2 px-1.5 text-center tabular-nums">{s.losses}</td>
                <td className="py-2 px-1.5 text-center tabular-nums text-gray-custom">{s.goalDifference > 0 ? `+${s.goalDifference}` : s.goalDifference}</td>
                <td className="py-2 px-2 text-center tabular-nums font-semibold">{s.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {/* Fixtures */}
      {group.matches.length > 0 && (
        <div className="border-t border-line divide-y divide-line/60">
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
  return (
    <div className={`flex items-center gap-3 px-4 ${compact ? 'py-2' : 'py-2.5'} text-sm`}>
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
  );
}

// ── knockout bracket (connector tree) ──────────────────────────────────────────
function Bracket({ rounds, teams }: { rounds: { stage: string; title: string; matches: BMatch[] }[]; teams: Record<string, TeamLite> }) {
  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex min-w-max">
        {rounds.map((round, ri) => {
          const last = ri === rounds.length - 1;
          return (
            <div key={round.stage} className="flex flex-col" style={{ minWidth: 190 }}>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-custom text-center pb-3">{round.title}</div>
              <div className="flex-1 flex flex-col">
                {round.matches.map((m, mi) => {
                  const isTop = mi % 2 === 0;
                  const hasPartner = isTop ? mi + 1 < round.matches.length : true;
                  return (
                    <div key={m.id} className="flex-1 flex items-stretch">
                      <div className="flex-1 flex items-center px-1">
                        <BracketMatch m={m} teams={teams} champion={last} />
                      </div>
                      {!last && (
                        <div className="relative shrink-0" style={{ width: CW }}>
                          {/* stub out of this match to mid-x */}
                          <div className="absolute top-1/2 left-0 h-0.5 bg-gray-custom/40" style={{ width: CW / 2 }} />
                          {/* vertical half joining the pair */}
                          {hasPartner && (
                            <div
                              className="absolute w-0.5 bg-gray-custom/40"
                              style={{ left: CW / 2, ...(isTop ? { top: '50%', bottom: 0 } : { top: 0, height: '50%' }) }}
                            />
                          )}
                          {/* into-next stub from the pair midpoint (drawn once, on the top match) */}
                          {isTop && hasPartner && (
                            <div className="absolute h-0.5 bg-gray-custom/40" style={{ left: CW / 2, right: 0, bottom: 0 }} />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BracketMatch({ m, teams, champion }: { m: BMatch; teams: Record<string, TeamLite>; champion?: boolean }) {
  const played = isPlayed(m);
  return (
    <div className="w-full rounded-lg border border-line bg-surface overflow-hidden">
      <BracketRow team={teams[m.homeTeamId ?? '']} score={m.homeScore} win={m.winnerTeamId === m.homeTeamId && !!m.homeTeamId} played={played} champion={champion} />
      <div className="h-px bg-line" />
      <BracketRow team={teams[m.awayTeamId ?? '']} score={m.awayScore} win={m.winnerTeamId === m.awayTeamId && !!m.awayTeamId} played={played} champion={champion} />
    </div>
  );
}
function BracketRow({ team, score, win, played, champion }: { team?: TeamLite; score: number | null; win: boolean; played: boolean; champion?: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-2.5 py-1.5 ${win ? 'bg-primary/10' : ''}`}>
      <span className={`flex items-center gap-2 min-w-0 flex-1 text-sm ${win ? 'font-semibold text-foreground' : played ? 'text-gray-custom' : 'text-foreground'}`}>
        {win && champion && <Trophy size={12} className="text-primary shrink-0" />}
        <TeamChip team={team} size={18} />
      </span>
      <span className={`font-numeric tabular-nums text-sm shrink-0 ${win ? 'text-primary font-semibold' : 'text-gray-custom'}`}>
        {played && score != null ? score : '–'}
      </span>
    </div>
  );
}

function ThirdPlace({ m, teams }: { m: BMatch; teams: Record<string, TeamLite> }) {
  return (
    <div className="mt-6 pt-5 border-t border-line">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-custom flex items-center gap-1.5 mb-3">
        <Medal size={13} className="text-amber-400" /> Third place
      </div>
      <div className="max-w-xs">
        <BracketMatch m={m} teams={teams} />
      </div>
    </div>
  );
}
