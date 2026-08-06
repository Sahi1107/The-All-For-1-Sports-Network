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
 *
 * TWO ENTRY POINTS, ONE SHEET:
 *
 *   • STANDALONE (`matchId` / neither) — a match the draw never knew about. The
 *     organiser picks both teams and the date, and a new match is created.
 *
 *   • FIXTURE (`trackerMatchId`) — a fixture that already exists in the draw and
 *     simply never got tracked. Teams, round, court and date come from the
 *     fixture, so they're shown read-only rather than asked for: a box score
 *     supplies numbers, not scheduling. Publishing flips that fixture to
 *     PUBLISHED in the fixtures list, exactly as tracking it would have.
 *
 * The grid, the validation and the totals are identical either way — only where
 * the sheet is loaded from and posted to differs.
 */

interface RosterPlayer { userId: string; name: string; position?: string | null }
interface TeamOption { id: string; name: string; players: RosterPlayer[] }

type Row = { userId: string; name: string; number?: number | null; played: boolean; stats: Record<string, number> };

const blankStats = (cols: StatColumn[]) =>
  Object.fromEntries(cols.map((c) => [c.key, 0])) as Record<string, number>;

export default function BoxScoreModal({
  tournamentId, sport, teams, matchId, trackerMatchId, onClose,
}: {
  tournamentId: string;
  sport: string;
  teams: TeamOption[];
  /** Set to correct an existing standalone manual box score. */
  matchId?: string;
  /** Set to enter/correct the box score of an existing draw fixture. */
  trackerMatchId?: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const cols = useMemo(() => columnsFor(sport), [sport]);
  const derived = useMemo(() => derivedFor(sport), [sport]);
  const scoreField = scoreFieldFor(sport);

  // Anchored to a fixture from the draw: the match already exists, so the teams
  // and scheduling are facts to display, not fields to fill in.
  const isFixture = !!trackerMatchId;

  const [homeTeamId, setHomeTeamId] = useState('');
  const [awayTeamId, setAwayTeamId] = useState('');
  const [matchDate, setMatchDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [round, setRound] = useState('');
  const [court, setCourt] = useState('');
  const [home, setHome] = useState<Row[]>([]);
  const [away, setAway] = useState<Row[]>([]);
  // In fixture mode the team names come from the API, not the `teams` list (the
  // fixtures page doesn't carry full rosters). Falls back to the list otherwise.
  const [names, setNames] = useState<{ home: string; away: string } | null>(null);
  const [alreadyEntered, setAlreadyEntered] = useState(false);

  const nameOf = (side: 'home' | 'away') =>
    names?.[side] ?? teams.find((t) => t.id === (side === 'home' ? homeTeamId : awayTeamId))?.name ?? '';

  // Load the existing sheet — the saved box score when correcting, or the two
  // rosters as a blank sheet for a fixture. Players come back with played:false
  // where no stat row exists, because a DNP writes no row: absence IS the record.
  const { data: existing, isLoading, error: loadError } = useQuery({
    queryKey: isFixture ? ['fixture-box-score', trackerMatchId] : ['box-score', tournamentId, matchId],
    queryFn: async () => (await api.get(
      isFixture
        ? `/tracker/matches/${trackerMatchId}/box-score`
        : `/tournaments/${tournamentId}/box-scores/${matchId}`,
    )).data,
    enabled: isFixture || !!matchId,
    retry: false,
  });

  useEffect(() => {
    if (!existing) return;
    const toRows = (side: any[]): Row[] => side.map((p) => ({
      userId: p.userId, name: p.name, number: p.number ?? null, played: p.played,
      stats: { ...blankStats(cols), ...(p.stats ?? {}) },
    }));
    setHome(toRows(existing.home));
    setAway(toRows(existing.away));

    if (existing.fixture) {
      const f = existing.fixture;
      setHomeTeamId(f.homeTeamId);
      setAwayTeamId(f.awayTeamId);
      setNames({ home: f.homeTeamName, away: f.awayTeamName });
      setRound(f.round ?? '');
      setCourt(f.court ?? '');
      if (f.scheduledAt) setMatchDate(new Date(f.scheduledAt).toISOString().slice(0, 10));
      setAlreadyEntered(!!f.alreadyEntered);
      return;
    }
    setHomeTeamId(existing.match.homeTeamId);
    setAwayTeamId(existing.match.awayTeamId);
    setMatchDate(new Date(existing.match.matchDate).toISOString().slice(0, 10));
    setRound(existing.match.round ?? '');
    setCourt(existing.match.court ?? '');
    setAlreadyEntered(true);
  }, [existing, cols]);

  // Picking a team loads its roster, everyone starting as "played" with zeros.
  const loadSide = (teamId: string, setter: (r: Row[]) => void) => {
    const team = teams.find((t) => t.id === teamId);
    setter((team?.players ?? []).map((p) => ({
      userId: p.userId, name: p.name, played: true, stats: blankStats(cols),
    })));
  };

  const setHomeTeam = (id: string) => { setHomeTeamId(id); setNames(null); if (!matchId) loadSide(id, setHome); };
  const setAwayTeam = (id: string) => { setAwayTeamId(id); setNames(null); if (!matchId) loadSide(id, setAway); };

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
      // DNP lines carry no stats — the server writes no row for them.
      const sides = {
        home: home.map((r) => (r.played ? { userId: r.userId, played: true, stats: r.stats } : { userId: r.userId, played: false })),
        away: away.map((r) => (r.played ? { userId: r.userId, played: true, stats: r.stats } : { userId: r.userId, played: false })),
      };
      // A fixture already owns its teams and scheduling; sending them would let a
      // box score quietly re-point the fixture, so only the sheets go up.
      if (isFixture) return api.post(`/tracker/matches/${trackerMatchId}/box-score`, sides);

      const body = {
        ...sides,
        homeTeamId, awayTeamId,
        matchDate: new Date(`${matchDate}T12:00:00`).toISOString(),
        round: round.trim() || undefined,
        court: court.trim() || undefined,
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
      // The fixtures list shows the new score + PUBLISHED badge straight away.
      qc.invalidateQueries({ queryKey: ['tracker-session'] });
      qc.invalidateQueries({ queryKey: ['fixture-box-score', trackerMatchId] });
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
    const teamName = nameOf(side);
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
              {alreadyEntered ? 'Correct box score' : 'Add box score'}
            </p>
            <h3 className="font-semibold truncate flex items-center gap-2">
              <ClipboardList size={16} className="text-primary shrink-0" />
              {isFixture
                ? `${nameOf('home')} vs ${nameOf('away')}`
                : 'Untracked match result'}
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

          {isFixture ? (
            /* The draw already set the teams and the schedule — shown, not asked for. */
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-custom px-3 py-2 rounded-lg border border-line bg-surface">
              <span className="font-medium text-foreground">{round || 'Fixture'}</span>
              {court && <span>· {court}</span>}
              {matchDate && <span>· {new Date(`${matchDate}T12:00:00`).toLocaleDateString()}</span>}
              <span className="ml-auto">Teams and schedule come from the draw</span>
            </div>
          ) : (
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
          )}

          {loadError ? (
            <p className="text-sm text-red-400 text-center py-6">
              {(loadError as any)?.response?.data?.error ?? 'Could not load this fixture.'}
            </p>
          ) : isLoading ? (
            <p className="text-sm text-gray-custom text-center py-6">Loading rosters…</p>
          ) : (
            <>
              {teamsPicked && (
                <div className="flex items-center justify-center gap-4 py-2 border-y border-line">
                  <span className="text-sm text-gray-custom truncate max-w-[35%] text-right">{nameOf('home')}</span>
                  <span className="text-2xl font-bold tabular-nums">{homeScore} – {awayScore}</span>
                  <span className="text-sm text-gray-custom truncate max-w-[35%]">{nameOf('away')}</span>
                </div>
              )}

              {renderSide('home')}
              {renderSide('away')}

              {!teamsPicked && !isFixture && (
                <p className="text-sm text-gray-custom text-center py-6">Pick both teams to load their rosters.</p>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-line">
          {/* Deleting is only offered for a standalone box score. A fixture's
              result is removed by un-publishing it in the tracker, which also
              returns the fixture to SCHEDULED — deleting the match here would
              strip the result but leave the fixture claiming to be PUBLISHED. */}
          {matchId && !isFixture ? (
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
              {save.isPending ? 'Publishing…' : alreadyEntered ? 'Save corrections' : 'Publish result & stats'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
