import { X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import type { TrackerSession, TrackerMatch, FootballState, FootballEvent } from '../types';
import { footballPlayerRows, basketballPlayerRows, type FootballPlayerRow, type BasketballPlayerRow } from '../stats';
import { teamNames } from './helpers';
import api from '../../../api/client';
import BallLoader from '../../../components/BallLoader';

/** Read-only breakdown of a finished (or in-progress) match: final score plus
 *  a football event timeline / box score or a basketball box score. */
export default function MatchDetails({
  session,
  match,
  onClose,
}: {
  session: TrackerSession;
  match: TrackerMatch;
  onClose: () => void;
}) {
  const name = teamNames(session);

  // Live tracker state is authoritative; a published/imported match with no state
  // falls back to the DB (same live-else-DB pattern as the leaders card).
  const hasState = !!match.state;
  const { data: dbData, isLoading: dbLoading } = useQuery({
    queryKey: ['match-stats', match.publishedMatchId],
    queryFn: async () => (await api.get(`/tournaments/matches/${match.publishedMatchId}/stats`)).data,
    enabled: !hasState && !!match.publishedMatchId,
  });
  const dbRows = hasState ? undefined : (dbData?.rows as any[] | undefined);
  const showLoader = !hasState && !!match.publishedMatchId && dbLoading;

  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-card border border-line rounded-2xl shadow-xl w-full max-w-2xl max-h-[88vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-line">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-custom">{match.round || match.stage}</p>
            <h3 className="font-semibold">Match details</h3>
          </div>
          <button onClick={onClose} className="text-gray-custom hover:text-foreground"><X size={18} /></button>
        </div>

        {/* Scoreline */}
        <div className="px-5 py-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-line">
          <span className="text-right font-medium truncate">{name(match.homeTeamId)}</span>
          <span className="text-3xl font-mono font-bold tabular-nums px-3">
            {match.homeScore}<span className="text-gray-custom mx-2">–</span>{match.awayScore}
          </span>
          <span className="font-medium truncate">{name(match.awayTeamId)}</span>
        </div>

        <div className="overflow-y-auto p-5">
          {showLoader ? (
            <div className="flex justify-center py-8"><BallLoader /></div>
          ) : session.sport === 'FOOTBALL' ? (
            <FootballDetails session={session} match={match} dbRows={dbRows as FootballPlayerRow[] | undefined} />
          ) : (
            <BasketballDetails session={session} match={match} dbRows={dbRows as BasketballPlayerRow[] | undefined} />
          )}
        </div>
      </div>
    </div>
  );
}

function FootballDetails({ session, match, dbRows }: { session: TrackerSession; match: TrackerMatch; dbRows?: FootballPlayerRow[] }) {
  const rows = (match.state ? footballPlayerRows(match, session) : (dbRows ?? [])).filter(
    (r) => r.goals || r.assists || r.saves || r.tackles || r.shots || r.yellow || r.red,
  );
  const state = match.state as FootballState | null;
  const timeline = (state?.events ?? [])
    .filter((e) => ['goal', 'yellow_card', 'red_card'].includes(e.type))
    .slice()
    .sort((a, b) => a.minute - b.minute);
  const playerName = new Map<string, string>();
  (session.roster ?? []).forEach((t) => t.players.forEach((p) => playerName.set(p.userId, p.name)));

  const icon = (e: FootballEvent) =>
    e.type === 'goal' ? '⚽' : e.type === 'yellow_card' ? '🟨' : '🟥';

  return (
    <div className="space-y-5">
      {timeline.length > 0 && (
        <div>
          <h4 className="text-xs uppercase tracking-wide text-gray-custom mb-2">Timeline</h4>
          <ul className="space-y-1">
            {timeline.map((e) => (
              <li key={e.id} className="flex items-center gap-2 text-sm">
                <span className="font-mono text-xs text-gray-custom w-9">{e.minute}′</span>
                <span>{icon(e)}</span>
                <span>{playerName.get(e.playerId) ?? 'Player'}{e.isPenalty ? ' (pen.)' : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h4 className="text-xs uppercase tracking-wide text-gray-custom mb-2">Player stats</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] text-gray-custom border-b border-line">
                <th className="text-left font-normal py-1.5 pr-2">Player</th>
                <Th>G</Th><Th>A</Th><Th>Sh</Th><Th>SoT</Th><Th>Sv</Th><Th>Tkl</Th><Th>Min</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.userId} className="border-b border-line last:border-0">
                  <td className="py-1.5 pr-2">
                    <span className="truncate">{r.name}</span>
                    <span className="text-[11px] text-gray-custom ml-1">{r.teamName}</span>
                  </td>
                  <Td>{r.goals}</Td><Td>{r.assists}</Td><Td>{r.shots}</Td><Td>{r.shotsOnTarget}</Td>
                  <Td>{r.saves}</Td><Td>{r.tackles}</Td><Td>{r.minutes}</Td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="py-3 text-center text-gray-custom text-sm">No recorded stats.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function BasketballDetails({ session, match, dbRows }: { session: TrackerSession; match: TrackerMatch; dbRows?: BasketballPlayerRow[] }) {
  const rows = (match.state ? basketballPlayerRows(match, session) : (dbRows ?? [])).filter((r) => r.min > 0 || r.pts || r.reb || r.ast);
  const teams = [...new Set(rows.map((r) => r.teamName))];

  return (
    <div className="space-y-5">
      {teams.map((team) => (
        <div key={team}>
          <h4 className="text-xs uppercase tracking-wide text-gray-custom mb-2">{team}</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-gray-custom border-b border-line">
                  <th className="text-left font-normal py-1.5 pr-2">Player</th>
                  <Th>PTS</Th><Th>REB</Th><Th>AST</Th><Th>STL</Th><Th>BLK</Th><Th>FG</Th><Th>3P</Th>
                </tr>
              </thead>
              <tbody>
                {rows.filter((r) => r.teamName === team).map((r) => (
                  <tr key={r.userId} className="border-b border-line last:border-0">
                    <td className="py-1.5 pr-2 truncate">{r.name}</td>
                    <Td>{r.pts}</Td><Td>{r.reb}</Td><Td>{r.ast}</Td><Td>{r.stl}</Td><Td>{r.blk}</Td>
                    <Td>{r.fg}/{r.fga}</Td><Td>{r.tp}/{r.tpa}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {rows.length === 0 && <p className="text-center text-gray-custom text-sm">No recorded stats.</p>}
    </div>
  );
}

const Th = ({ children }: { children: React.ReactNode }) => (
  <th className="text-center font-normal py-1.5 px-1.5">{children}</th>
);
const Td = ({ children }: { children: React.ReactNode }) => (
  <td className="text-center py-1.5 px-1.5 font-mono tabular-nums">{children}</td>
);
