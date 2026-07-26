import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { X, CalendarClock } from 'lucide-react';
import api from '../../api/client';
import BallLoader from '../../components/BallLoader';
import { fmtSchedule } from '../statTracker/schedule';

export interface MatchInfo {
  statsMatchId: string | null;   // platform Match id (null → not published / no box score)
  sport: string;
  homeName: string; awayName: string;
  homeScore: number | null; awayScore: number | null;
  status: string; round: string | null;
  scheduledAt?: string | null; court?: string | null;
}

// Box-score columns per sport (match the shape returned by /matches/:id/stats).
const COLS: Record<string, { key: string; label: string }[]> = {
  FOOTBALL: [
    { key: 'goals', label: 'G' }, { key: 'assists', label: 'A' }, { key: 'shots', label: 'Sh' },
    { key: 'saves', label: 'Sv' }, { key: 'tackles', label: 'Tkl' }, { key: 'minutes', label: 'Min' },
  ],
  BASKETBALL: [
    { key: 'pts', label: 'PTS' }, { key: 'reb', label: 'REB' }, { key: 'ast', label: 'AST' },
    { key: 'stl', label: 'STL' }, { key: 'blk', label: 'BLK' }, { key: 'tp', label: '3P' },
  ],
  CRICKET: [
    { key: 'runs', label: 'Runs' }, { key: 'wickets', label: 'Wkts' }, { key: 'fours', label: '4s' }, { key: 'sixes', label: '6s' },
  ],
};

/** Public match detail: scoreline + per-player box score (DB fallback). Player
 *  names link to profiles. Deliberate states for not-played / in-progress / no-stats. */
export default function MatchDetailModal({ match, onClose }: { match: MatchInfo; onClose: () => void }) {
  const played = match.status === 'COMPLETED' || match.status === 'PUBLISHED';
  const live = match.status === 'IN_PROGRESS';
  const showScore = played || live;

  const { data, isLoading } = useQuery<{ sport: string; rows: any[] }>({
    queryKey: ['match-stats', match.statsMatchId],
    queryFn: async () => (await api.get(`/tournaments/matches/${match.statsMatchId}/stats`)).data,
    enabled: !!match.statsMatchId,
  });
  const rows = data?.rows ?? [];
  const cols = COLS[match.sport] ?? [];
  const when = fmtSchedule(match.scheduledAt, match.court);

  const byTeam = new Map<string, any[]>();
  rows.forEach((r) => { const a = byTeam.get(r.teamName) ?? []; a.push(r); byTeam.set(r.teamName, a); });
  const ordered = [match.homeName, match.awayName]
    .filter((n) => byTeam.has(n))
    .concat([...byTeam.keys()].filter((n) => n !== match.homeName && n !== match.awayName));

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-line rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-line">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-custom flex items-center gap-2">
              <span>{match.round || 'Match'}</span>
              {live && <span className="flex items-center gap-1 text-amber-300 normal-case"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> Live</span>}
            </p>
            <h3 className="font-semibold">Match details</h3>
          </div>
          <button onClick={onClose} className="text-gray-custom hover:text-foreground"><X size={18} /></button>
        </div>

        {/* Scoreline */}
        <div className="px-5 py-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-line">
          <span className="text-right font-medium truncate">{match.homeName}</span>
          <span className="font-numeric text-2xl font-bold tabular-nums px-3">
            {showScore
              ? <span>{match.homeScore ?? 0}<span className="text-gray-custom mx-2">–</span>{match.awayScore ?? 0}</span>
              : <span className="text-gray-custom text-base">vs</span>}
          </span>
          <span className="font-medium truncate">{match.awayName}</span>
        </div>
        {when && <div className="px-5 py-2 text-xs text-gray-custom flex items-center gap-1.5 border-b border-line"><CalendarClock size={12} /> {when}</div>}

        {/* Body */}
        <div className="overflow-y-auto p-5">
          {!match.statsMatchId ? (
            <p className="text-center text-sm text-gray-custom py-6">
              {live ? "This match is in progress — the box score appears once it's published."
                : played ? 'No player stats were recorded for this match.'
                : "This match hasn't been played yet."}
            </p>
          ) : isLoading ? (
            <div className="flex justify-center py-8"><BallLoader /></div>
          ) : rows.length === 0 ? (
            <p className="text-center text-sm text-gray-custom py-6">No player stats recorded for this match.</p>
          ) : (
            <div className="space-y-5">
              {ordered.map((team) => (
                <div key={team}>
                  <h4 className="text-xs uppercase tracking-wide text-gray-custom mb-2">{team}</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[11px] text-gray-custom border-b border-line">
                          <th className="text-left font-normal py-1.5 pr-2">Player</th>
                          {cols.map((c) => <th key={c.key} className="text-center font-normal py-1.5 px-1.5 whitespace-nowrap">{c.label}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {byTeam.get(team)!.map((r) => (
                          <tr key={r.userId} className="border-b border-line/60 last:border-0">
                            <td className="py-1.5 pr-2">
                              <Link to={`/profile/${r.userId}`} className="hover:text-primary-light hover:underline" onClick={onClose}>{r.name}</Link>
                            </td>
                            {cols.map((c) => <td key={c.key} className="text-center py-1.5 px-1.5 font-numeric tabular-nums">{r[c.key] ?? 0}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
