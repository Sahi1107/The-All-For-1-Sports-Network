import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import BallLoader from '../../components/BallLoader';
import { Users, Crown, ChevronDown, Shield } from 'lucide-react';

// ── stat presentation per sport ──────────────────────────────────────────────
// `head` = compact stats shown on the collapsed player row; `labels` = short
// column headers for every field in the per-match breakdown table.
const STAT_UI: Record<string, { head: string[]; labels: Record<string, string> }> = {
  FOOTBALL: {
    head: ['goals', 'assists'],
    labels: { goals: 'G', assists: 'A', shots: 'Sh', passes: 'Pass', tackles: 'Tkl', saves: 'Sv', yellowCards: 'YC', redCards: 'RC', minutesPlayed: 'Min' },
  },
  BASKETBALL: {
    head: ['points', 'rebounds', 'assists'],
    labels: { points: 'PTS', rebounds: 'REB', assists: 'AST', steals: 'STL', blocks: 'BLK', threePointers: '3PM', freeThrows: 'FTM', turnovers: 'TO', minutesPlayed: 'Min' },
  },
  CRICKET: {
    head: ['runs', 'wickets'],
    labels: { runs: 'Runs', ballsFaced: 'BF', fours: '4s', sixes: '6s', wickets: 'Wkts', runsConceded: 'RC', catches: 'Ct', runOuts: 'RO', oversBowled: 'Ov' },
  },
};

interface PlayerMatch { matchId: string; [k: string]: number | string }
interface Player {
  id: string; name: string; position: string | null; age: number | null; avatar: string | null;
  role: string; isCaptain: boolean;
  totals: { matches: number; totals: Record<string, number> } | null;
  perMatch: PlayerMatch[];
}
interface Team { id: string; name: string; logo: string | null; captainId: string; players: Player[] }
interface MatchLite {
  id: string; round: string | null; date: string;
  homeTeamId: string; awayTeamId: string; homeTeamName: string | null; awayTeamName: string | null;
  homeScore: number | null; awayScore: number | null;
}
interface TeamsResponse {
  sport: string; isStatSport: boolean; statFields: string[];
  matches: MatchLite[]; teams: Team[];
}

function fmt(v: number) {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export default function TournamentTeams({ tournamentId }: { tournamentId: string }) {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useQuery<TeamsResponse>({
    queryKey: ['tournament-teams', tournamentId],
    queryFn: async () => (await api.get(`/tournaments/${tournamentId}/teams`)).data,
  });

  const [openPlayer, setOpenPlayer] = useState<string | null>(null);

  if (isLoading) return <div className="flex justify-center py-16"><BallLoader /></div>;
  if (isError || !data) {
    return <div className="bg-card rounded-xl border border-line p-12 text-center text-sm text-gray-custom">Couldn't load teams.</div>;
  }
  if (data.teams.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-line p-12 text-center">
        <Users size={28} className="mx-auto mb-3 text-gray-custom" />
        <p className="text-sm text-gray-custom">No teams registered yet.</p>
      </div>
    );
  }

  const ui = STAT_UI[data.sport];
  const matchById = new Map(data.matches.map((m) => [m.id, m]));

  return (
    <div className="space-y-4">
      {data.teams.map((team) => (
        <div key={team.id} className="bg-card rounded-xl border border-line overflow-hidden">
          {/* Team header */}
          <div className="flex items-center gap-3 p-4 border-b border-line">
            {team.logo
              ? <img src={team.logo} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0 border border-line" />
              : <div className="w-9 h-9 rounded-lg bg-elevated flex items-center justify-center font-bold text-gray-custom shrink-0">{team.name.charAt(0).toUpperCase()}</div>}
            <div className="min-w-0">
              <h3 className="font-semibold text-sm truncate">{team.name}</h3>
              <p className="text-xs text-gray-custom flex items-center gap-1"><Users size={11} /> {team.players.length} players</p>
            </div>
          </div>

          {/* Roster */}
          {team.players.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-custom text-center">No accepted players yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {team.players.map((p) => {
                const isOpen = openPlayer === `${team.id}:${p.id}`;
                const canExpand = data.isStatSport && p.perMatch.length > 0;
                return (
                  <li key={p.id}>
                    <div
                      className={`flex items-center gap-3 px-4 py-3 ${canExpand ? 'cursor-pointer hover:bg-surface' : ''} transition-colors`}
                      onClick={() => canExpand && setOpenPlayer(isOpen ? null : `${team.id}:${p.id}`)}
                    >
                      {/* Avatar → profile */}
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/profile/${p.id}`); }}
                        className="shrink-0"
                        title="View profile"
                      >
                        {p.avatar
                          ? <img src={p.avatar} alt="" className="w-10 h-10 rounded-full object-cover border border-line" />
                          : <div className="w-10 h-10 rounded-full bg-elevated flex items-center justify-center text-sm font-bold text-gray-custom">{p.name.charAt(0).toUpperCase()}</div>}
                      </button>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate flex items-center gap-1.5">
                          {p.name}
                          {p.isCaptain && <Crown size={12} className="text-primary shrink-0" />}
                        </p>
                        <p className="text-xs text-gray-custom truncate">
                          {[p.position, p.age ? `${p.age} yrs` : null].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </div>

                      {/* Headline per-tournament stats */}
                      {data.isStatSport && ui && (
                        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                          {ui.head.map((f) => (
                            <Stat key={f} label={ui.labels[f]} value={p.totals ? fmt(p.totals.totals[f] ?? 0) : '0'} />
                          ))}
                          <Stat label="Mts" value={p.totals ? String(p.totals.matches) : '0'} muted />
                          {canExpand && <ChevronDown size={15} className={`text-gray-custom transition-transform ${isOpen ? 'rotate-180' : ''}`} />}
                        </div>
                      )}
                    </div>

                    {/* Per-match breakdown */}
                    {isOpen && canExpand && (
                      <div className="px-4 pb-4 pt-1 bg-surface/50 overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-gray-custom text-left">
                              <th className="font-medium py-1.5 pr-3 whitespace-nowrap">Match</th>
                              {data.statFields.map((f) => (
                                <th key={f} className="font-medium py-1.5 px-2 text-center whitespace-nowrap">{ui.labels[f] ?? f}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="font-numeric">
                            {p.perMatch.map((pm) => {
                              const m = matchById.get(pm.matchId);
                              const opp = m ? (m.homeTeamId === team.id ? m.awayTeamName : m.homeTeamName) : null;
                              const res = m ? matchResult(m, team.id) : null;
                              return (
                                <tr key={pm.matchId} className="border-t border-line/60">
                                  <td className="py-1.5 pr-3 whitespace-nowrap">
                                    <span className="text-foreground">{m?.round || 'Match'}</span>
                                    {opp && <span className="text-gray-custom"> · v {opp}</span>}
                                    {res && <span className={`ml-1.5 font-semibold ${res.cls}`}>{res.label}</span>}
                                  </td>
                                  {data.statFields.map((f) => (
                                    <td key={f} className="py-1.5 px-2 text-center tabular-nums">{fmt(Number(pm[f] ?? 0))}</td>
                                  ))}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}

      {!data.isStatSport && (
        <p className="text-xs text-gray-custom flex items-center gap-1.5 justify-center pt-1">
          <Shield size={12} /> Per-player stats aren't tracked for {data.sport.toLowerCase()} tournaments.
        </p>
      )}
    </div>
  );
}

function matchResult(m: MatchLite, teamId: string): { label: string; cls: string } | null {
  if (m.homeScore == null || m.awayScore == null) return null;
  const isHome = m.homeTeamId === teamId;
  const us = isHome ? m.homeScore : m.awayScore;
  const them = isHome ? m.awayScore : m.homeScore;
  if (us > them) return { label: `W ${us}–${them}`, cls: 'text-accent' };
  if (us < them) return { label: `L ${us}–${them}`, cls: 'text-red-400' };
  return { label: `D ${us}–${them}`, cls: 'text-gray-custom' };
}

function Stat({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="text-center w-9">
      <p className={`font-numeric text-base leading-none tabular-nums ${muted ? 'text-gray-custom' : 'text-foreground'}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-gray-custom mt-0.5">{label}</p>
    </div>
  );
}
