import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { X, ClipboardList, AlertTriangle, Wand2, Trash2 } from 'lucide-react';
import api from '../../api/client';
import {
  columnsFor, derivedFor, scoreFieldFor, validateRow, impliedPoints,
  type StatColumn,
} from './boxScoreConfig';

/**
 * Enter the box score of a match nobody tracked live.
 *
 * The sheet IS the result: team scores are summed from the players' scoring
 * rather than typed, so the final score can never disagree with the box score it
 * came from. Saving publishes per-player stats to every profile in the match and
 * recomputes the tournament's ranking boards — the same pipeline a live-tracked
 * match publishes through.
 *
 * DNP is a first-class state, not zeros. A player marked DNP has no stat row
 * written at all, because rankings average per game and a row of zeros would
 * count as a game played badly against their average.
 */

interface RosterPlayer { userId: string; name: string; position?: string | null }
interface TeamOption { id: string; name: string; players: RosterPlayer[] }

type Row = { userId: string; name: string; played: boolean; stats: Record<string, number> };

const blankStats = (cols: StatColumn[]) =>
  Object.fromEntries(cols.map((c) => [c.key, 0])) as Record<string, number>;

export default function BoxScoreModal({
  tournamentId, sport, teams, matchId, onClose,
}: {
  tournamentId: string;
  sport: string;
  teams: TeamOption[];
  /** Set to correct an existing manual box score; omit to enter a new one. */
  matchId?: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const cols = useMemo(() => columnsFor(sport), [sport]);
  const derived = useMemo(() => derivedFor(sport), [sport]);
  const scoreField = scoreFieldFor(sport);

  const [homeTeamId, setHomeTeamId] = useState('');
  const [awayTeamId, setAwayTeamId] = useState('');
  const [matchDate, setMatchDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [round, setRound] = useState('');
  const [court, setCourt] = useState('');
  const [home, setHome] = useState<Row[]>([]);
  const [away, setAway] = useState<Row[]>([]);

  // Correcting: load the saved sheet, including which players were DNP (they come
  // back with played:false because a DNP wrote no stat row).
  const { data: existing } = useQuery({
    queryKey: ['box-score', tournamentId, matchId],
    queryFn: async () => (await api.get(`/tournaments/${tournamentId}/box-scores/${matchId}`)).data,
    enabled: !!matchId,
  });

  useEffect(() => {
    if (!existing) return;
    setHomeTeamId(existing.match.homeTeamId);
    setAwayTeamId(existing.match.awayTeamId);
    setMatchDate(new Date(existing.match.matchDate).toISOString().slice(0, 10));
    setRound(existing.match.round ?? '');
    setCourt(existing.match.court ?? '');
    const toRows = (side: any[]): Row[] => side.map((p) => ({
      userId: p.userId, name: p.name, played: p.played,
      stats: { ...blankStats(cols), ...(p.stats ?? {}) },
    }));
    setHome(toRows(existing.home));
    setAway(toRows(existing.away));
  }, [existing, cols]);

  // Picking a team loads its roster, everyone starting as "played" with zeros.
  const loadSide = (teamId: string, setter: (r: Row[]) => void) => {
    const team = teams.find((t) => t.id === teamId);
    setter((team?.players ?? []).map((p) => ({
      userId: p.userId, name: p.name, played: true, stats: blankStats(cols),
    })));
  };

  const setHomeTeam = (id: string) => { setHomeTeamId(id); if (!matchId) loadSide(id, setHome); };
  const setAwayTeam = (id: string) => { setAwayTeamId(id); if (!matchId) loadSide(id, setAway); };

  const patch = (side: 'home' | 'away', i: number, key: string, value: number) => {
    const [rows, set] = side === 'home' ? [home, setHome] : [away, setAway];
    const next = rows.slice();
    next[i] = { ...next[i], stats: { ...next[i].stats, [key]: value } };
    set(next);
  };
  const toggleDnp = (side: 'home' | 'away', i: number) => {
    const [rows, set] = side === 'home' ? [home, setHome] : [away, setAway];
    const next = rows.slice();
    next[i] = { ...next[i], played: !next[i].played };
    set(next);
  };

  const totalsFor = (rows: Row[]) => {
    const t = blankStats(cols);
    rows.filter((r) => r.played).forEach((r) => cols.forEach((c) => { t[c.key] += Number(r.stats[c.key] ?? 0); }));
    return t;
  };
  const homeScore = totalsFor(home)[scoreField] ?? 0;
  const awayScore = totalsFor(away)[scoreField] ?? 0;

  // Row-level problems, keyed "home-3" so the offending cell can be outlined.
  const rowErrors = useMemo(() => {
    const errs = new Map<string, { key: string; message: string }>();
    (['home', 'away'] as const).forEach((side) => {
      (side === 'home' ? home : away).forEach((r, i) => {
        if (!r.played) return;
        const e = validateRow(sport, r.stats);
        if (e) errs.set(`${side}-${i}`, e);
      });
    });
    return errs;
  }, [home, away, sport]);

  const anyPlayed = [...home, ...away].some((r) => r.played);
  const teamsPicked = !!homeTeamId && !!awayTeamId && homeTeamId !== awayTeamId;
  const canSave = teamsPicked && anyPlayed && rowErrors.size === 0;

  const save = useMutation({
    mutationFn: () => {
      const body = {
        homeTeamId, awayTeamId,
        matchDate: new Date(`${matchDate}T12:00:00`).toISOString(),
        round: round.trim() || undefined,
        court: court.trim() || undefined,
        // DNP lines carry no stats — the server writes no row for them.
        home: home.map((r) => (r.played ? { userId: r.userId, played: true, stats: r.stats } : { userId: r.userId, played: false })),
        away: away.map((r) => (r.played ? { userId: r.userId, played: true, stats: r.stats } : { userId: r.userId, played: false })),
      };
      return matchId
        ? api.put(`/tournaments/${tournamentId}/box-scores/${matchId}`, body)
        : api.post(`/tournaments/${tournamentId}/box-scores`, body);
    },
    onSuccess: (res: any) => {
      const { playerCount, homeScore: hs, awayScore: as } = res.data ?? {};
      toast.success(`Published ${hs}–${as} · stats live for ${playerCount} player${playerCount === 1 ? '' : 's'}`);
      qc.invalidateQueries({ queryKey: ['box-scores', tournamentId] });
      qc.invalidateQueries({ queryKey: ['manage-tournament', tournamentId] });
      qc.invalidateQueries({ queryKey: ['tournament-teams', tournamentId] });
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Could not publish the box score'),
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/tournaments/${tournamentId}/box-scores/${matchId}`),
    onSuccess: () => {
      toast.success('Box score deleted — stats and rankings updated');
      qc.invalidateQueries({ queryKey: ['box-scores', tournamentId] });
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Could not delete'),
  });

  const renderSide = (side: 'home' | 'away') => {
    const rows = side === 'home' ? home : away;
    const teamId = side === 'home' ? homeTeamId : awayTeamId;
    const teamName = teams.find((t) => t.id === teamId)?.name ?? '';
    if (!teamId) return null;
    const totals = totalsFor(rows);

    return (
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h4 className="font-semibold text-sm truncate">{teamName}</h4>
          <span className="text-lg font-bold tabular-nums">{totals[scoreField] ?? 0}</span>
        </div>

        {rows.length === 0 ? (
          <p className="text-xs text-gray-custom p-3 rounded-lg border border-line bg-surface">
            This team has no players on its roster yet. Add them in Teams &amp; players first.
          </p>
        ) : (
          <div className="overflow-x-auto border border-line rounded-lg">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-surface">
                  <th className="text-left font-medium px-2 py-1.5 sticky left-0 bg-surface z-10 min-w-[130px]">Player</th>
                  <th className="px-1 py-1.5 font-medium" title="Did not play">DNP</th>
                  {cols.map((c) => (
                    <th key={c.key} className={`px-1 py-1.5 font-medium ${c.wide ? 'min-w-[52px]' : 'min-w-[42px]'}`} title={c.title}>
                      {c.label}
                    </th>
                  ))}
                  {derived.map((d) => (
                    <th key={d.key} className="px-1 py-1.5 font-medium text-gray-custom min-w-[46px]">{d.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const err = rowErrors.get(`${side}-${i}`);
                  return (
                    <tr key={r.userId} className={`border-t border-line ${r.played ? '' : 'opacity-45'}`}>
                      <td className="px-2 py-1 sticky left-0 bg-card z-10 truncate max-w-[130px]" title={r.name}>{r.name}</td>
                      <td className="px-1 py-1 text-center">
                        <input
                          type="checkbox"
                          checked={!r.played}
                          onChange={() => toggleDnp(side, i)}
                          aria-label={`${r.name} did not play`}
                          className="accent-primary"
                        />
                      </td>
                      {cols.map((c) => (
                        <td key={c.key} className="px-0.5 py-1">
                          <input
                            type="number" min={0} max={c.max} step={c.key === 'oversBowled' ? 0.1 : 1}
                            value={r.played ? (r.stats[c.key] ?? 0) : ''}
                            disabled={!r.played}
                            onChange={(e) => patch(side, i, c.key, Math.max(0, Number(e.target.value || 0)))}
                            onFocus={(e) => e.currentTarget.select()}
                            aria-label={`${r.name} ${c.title}`}
                            className={`w-full px-1 py-1 text-center bg-surface border rounded tabular-nums focus:outline-none focus:border-primary disabled:opacity-40 ${
                              err?.key === c.key ? 'border-red-500' : 'border-line'
                            }`}
                          />
                        </td>
                      ))}
                      {derived.map((d) => {
                        const v = r.played ? d.compute(r.stats) : null;
                        return (
                          <td key={d.key} className="px-1 py-1 text-center text-gray-custom tabular-nums">
                            {v === null ? '—' : v.toFixed(1)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                <tr className="border-t-2 border-line bg-surface font-semibold">
                  <td className="px-2 py-1.5 sticky left-0 bg-surface z-10">TOTALS</td>
                  <td />
                  {cols.map((c) => (
                    <td key={c.key} className="px-1 py-1.5 text-center tabular-nums">{Math.round(totals[c.key] * 10) / 10}</td>
                  ))}
                  {derived.map((d) => {
                    const v = d.compute(totals);
                    return <td key={d.key} className="px-1 py-1.5 text-center text-gray-custom tabular-nums">{v === null ? '—' : v.toFixed(1)}</td>;
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Row problems, with a one-tap fix for the common points mismatch. */}
        {rows.map((r, i) => {
          const err = rowErrors.get(`${side}-${i}`);
          if (!err) return null;
          return (
            <div key={r.userId} className="flex items-center gap-2 text-[11px] text-red-400">
              <AlertTriangle size={11} className="shrink-0" />
              <span className="flex-1 min-w-0"><span className="font-medium">{r.name}</span>: {err.message}</span>
              {err.key === 'points' && (
                <button
                  onClick={() => patch(side, i, 'points', impliedPoints(r.stats))}
                  className="flex items-center gap-1 px-2 py-0.5 rounded border border-line text-gray-custom hover:text-foreground shrink-0"
                >
                  <Wand2 size={10} /> Fix
                </button>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-line rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-line">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-gray-custom">
              {matchId ? 'Correct box score' : 'Add box score'}
            </p>
            <h3 className="font-semibold truncate flex items-center gap-2">
              <ClipboardList size={16} className="text-primary shrink-0" />
              Untracked match result
            </h3>
          </div>
          <button onClick={onClose} className="text-gray-custom hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5">
          <p className="text-xs text-gray-custom">
            For a match that wasn't scored live. The totals below become the result, every
            player's stats publish to their profile, and the rankings update. Mark anyone who
            didn't play as <span className="font-medium text-foreground">DNP</span> — they get no
            stat line, so their per-game averages aren't diluted.
          </p>

          {/* Fixture */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] text-gray-custom mb-1">Home team</label>
              <select
                value={homeTeamId} onChange={(e) => setHomeTeam(e.target.value)} disabled={!!matchId}
                className="w-full px-2 py-2 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:border-primary disabled:opacity-50"
              >
                <option value="">Select…</option>
                {teams.filter((t) => t.id !== awayTeamId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-gray-custom mb-1">Away team</label>
              <select
                value={awayTeamId} onChange={(e) => setAwayTeam(e.target.value)} disabled={!!matchId}
                className="w-full px-2 py-2 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:border-primary disabled:opacity-50"
              >
                <option value="">Select…</option>
                {teams.filter((t) => t.id !== homeTeamId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-gray-custom mb-1">Date played</label>
              <input
                type="date" value={matchDate} onChange={(e) => setMatchDate(e.target.value)}
                className="w-full px-2 py-2 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-custom mb-1">Round (optional)</label>
              <input
                type="text" value={round} onChange={(e) => setRound(e.target.value)} maxLength={50}
                placeholder="Group A / Final"
                className="w-full px-2 py-2 bg-surface border border-line rounded-lg text-sm focus:outline-none focus:border-primary placeholder-gray-custom"
              />
            </div>
          </div>

          {teamsPicked && (
            <div className="flex items-center justify-center gap-4 py-2 border-y border-line">
              <span className="text-sm text-gray-custom truncate max-w-[35%] text-right">{teams.find((t) => t.id === homeTeamId)?.name}</span>
              <span className="text-2xl font-bold tabular-nums">{homeScore} – {awayScore}</span>
              <span className="text-sm text-gray-custom truncate max-w-[35%]">{teams.find((t) => t.id === awayTeamId)?.name}</span>
            </div>
          )}

          {renderSide('home')}
          {renderSide('away')}

          {!teamsPicked && (
            <p className="text-sm text-gray-custom text-center py-6">Pick both teams to load their rosters.</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-line">
          {matchId ? (
            <button
              onClick={() => { if (confirm('Delete this box score? The stats and rankings it produced will be removed.')) remove.mutate(); }}
              disabled={remove.isPending}
              className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg border border-line text-red-400 hover:bg-elevated disabled:opacity-50"
            >
              <Trash2 size={13} /> Delete
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-line hover:bg-elevated transition-colors">Cancel</button>
            <button
              onClick={() => save.mutate()}
              disabled={!canSave || save.isPending}
              title={rowErrors.size > 0 ? 'Fix the highlighted rows first' : undefined}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-primary hover:bg-primary-dark text-on-primary transition-colors disabled:opacity-50"
            >
              {save.isPending ? 'Publishing…' : matchId ? 'Save corrections' : 'Publish result & stats'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
