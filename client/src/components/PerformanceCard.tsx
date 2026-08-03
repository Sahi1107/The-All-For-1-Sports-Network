import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { BadgeCheck, Award, ChevronDown } from 'lucide-react';
import api from '../api/client';

export interface MatchLine {
  matchId: string;
  tournamentId: string;
  matchDate: string;
  round: string | null;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  stats: Record<string, number>;
}

interface PCData {
  sport: string | null;
  isStatSport: boolean;
  career: { matches: number; totals: Record<string, number>; averages: Record<string, number> } | null;
  tournaments: Array<{ id: string; name: string; startDate: string; matches: number; totals: Record<string, number>; averages?: Record<string, number> }>;
  matchLines?: MatchLine[];
  competition: Array<{ tournament: { id: string; name: string; startDate: string }; team: { id: string; name: string }; teamMatches: number }>;
  rankings: Array<{ rank: number; score: number; category: string | null; tournament: { id: string; name: string } | null }>;
  endorsementCount: number;
  achievements: string[];
  athleticsEvents: string[];
}

// Hero-band metrics + receipt summaries per stat sport.
const HERO: Record<string, { key: string; label: string }[]> = {
  FOOTBALL:   [{ key: 'goals', label: 'Goals' }, { key: 'assists', label: 'Assists' }],
  BASKETBALL: [{ key: 'points', label: 'Points' }, { key: 'rebounds', label: 'Rebounds' }, { key: 'assists', label: 'Assists' }],
  CRICKET:    [{ key: 'runs', label: 'Runs' }, { key: 'wickets', label: 'Wickets' }],
};
const RECEIPT: Record<string, (t: Record<string, number>) => string> = {
  FOOTBALL:   (t) => `${t.goals} G · ${t.assists} A`,
  BASKETBALL: (t) => `${t.points} PTS · ${t.rebounds} REB`,
  CRICKET:    (t) => `${t.runs} runs · ${t.wickets} wkts`,
};
const METRIC_LABEL: Record<string, string> = {
  goals: 'Goals', assists: 'Assists', shots: 'Shots', passes: 'Passes', tackles: 'Tackles', saves: 'Saves',
  points: 'Points', rebounds: 'Rebounds', steals: 'Steals', blocks: 'Blocks',
  runs: 'Runs', wickets: 'Wickets', fours: 'Fours', sixes: 'Sixes', catches: 'Catches', minutesPlayed: 'Minutes',
};
const yr = (d: string) => (d ? String(new Date(d).getFullYear()) : '');

// Per-match box-score columns. Tournament leaderboards deliberately show only
// averages, so this is where the raw per-game numbers behind them live.
const MATCH_COLS: Record<string, { key: string; label: string }[]> = {
  BASKETBALL: [
    { key: 'minutesPlayed', label: 'MIN' }, { key: 'points', label: 'PTS' },
    { key: 'rebounds', label: 'REB' }, { key: 'assists', label: 'AST' },
    { key: 'steals', label: 'STL' }, { key: 'blocks', label: 'BLK' },
    { key: 'turnovers', label: 'TO' },
  ],
  FOOTBALL: [
    { key: 'minutesPlayed', label: 'MIN' }, { key: 'goals', label: 'G' },
    { key: 'assists', label: 'A' }, { key: 'shots', label: 'SH' },
    { key: 'tackles', label: 'TKL' }, { key: 'saves', label: 'SV' },
  ],
  CRICKET: [
    { key: 'runs', label: 'R' }, { key: 'ballsFaced', label: 'B' },
    { key: 'fours', label: '4s' }, { key: 'sixes', label: '6s' },
    { key: 'wickets', label: 'W' }, { key: 'catches', label: 'C' },
  ],
};

const shortDate = (d: string) =>
  d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';

/** Per-match stat lines for one tournament, plus that tournament's totals and
 *  averages — the full detail behind an averaged leaderboard figure. */
function MatchLineTable({ sport, lines, totals, averages, matches }: {
  sport: string; lines: MatchLine[]; totals: Record<string, number>;
  averages?: Record<string, number>; matches: number;
}) {
  const cols = MATCH_COLS[sport] ?? [];
  if (!cols.length) return null;
  const num = (v: number) => (Number.isInteger(v) ? v : Math.round(v * 10) / 10);

  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-xs tabular-nums">
        <thead>
          <tr className="text-gray-custom">
            <th className="py-1 pr-2 text-left font-medium">Match</th>
            {cols.map((c) => <th key={c.key} className="px-1.5 py-1 text-right font-medium">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.matchId} className="border-t border-line/60">
              <td className="py-1 pr-2">
                <span className="text-foreground/90">{l.homeTeam} v {l.awayTeam}</span>
                <span className="block text-[10px] text-gray-custom">
                  {[l.round, shortDate(l.matchDate)].filter(Boolean).join(' · ')}
                  {l.homeScore !== null && l.awayScore !== null && ` · ${l.homeScore}–${l.awayScore}`}
                </span>
              </td>
              {cols.map((c) => (
                <td key={c.key} className="px-1.5 py-1 text-right">{num(l.stats[c.key] ?? 0)}</td>
              ))}
            </tr>
          ))}
          <tr className="border-t border-line font-semibold text-foreground">
            <td className="py-1 pr-2">Total · {matches} match{matches === 1 ? '' : 'es'}</td>
            {cols.map((c) => <td key={c.key} className="px-1.5 py-1 text-right">{num(totals[c.key] ?? 0)}</td>)}
          </tr>
          {averages && matches > 1 && (
            <tr className="text-gray-custom">
              <td className="py-1 pr-2">Per game</td>
              {cols.map((c) => <td key={c.key} className="px-1.5 py-1 text-right">{num(averages[c.key] ?? 0)}</td>)}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Pure presentational card — takes the /performance-card payload. */
export function PerformanceCardView({ data, initialOpen = false }: { data: PCData; initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  // One tournament's match lines open at a time — the card sits inside a profile
  // page, so expanding every tournament at once would bury everything below it.
  const [openTournament, setOpenTournament] = useState<string | null>(null);
  const { sport, career, tournaments = [], matchLines = [], competition = [], rankings = [], endorsementCount = 0, achievements = [], athleticsEvents = [] } = data;
  const hasVerified = !!career || tournaments.length > 0 || competition.length > 0 || rankings.length > 0;
  const hero = (sport && HERO[sport]) || [];
  const topRank = rankings[0];

  return (
    <div className="bg-card rounded-xl border border-line p-5">
      <h2 className="font-semibold flex items-center gap-2 mb-4">
        <BadgeCheck size={16} className="text-primary-light" />
        Performance Card
      </h2>

      {!hasVerified && (
        <div className="text-center py-6 px-4 rounded-lg bg-surface border border-line">
          <p className="text-sm text-foreground/75">No recorded competition data yet.</p>
          <p className="text-xs text-gray-custom mt-1">Performances are recorded at All For 1 partnered tournaments.</p>
        </div>
      )}

      {/* ── Hero band — recorded (verified) headline metrics ── */}
      {career && (
        <div className="rounded-xl border border-primary/25 bg-primary/[0.06] px-4 py-4">
          <p className="flex items-center gap-1.5 font-display font-bold tracking-[0.1em] text-[10px] text-primary/90 mb-3">
            <BadgeCheck size={12} /> RECORDED BY ALL FOR 1
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {hero.map((m) => (
              <div key={m.key}>
                <p className="font-numeric font-bold tabular-nums text-3xl leading-none text-foreground">{career.totals[m.key] ?? 0}</p>
                <p className="text-[11px] uppercase tracking-wide text-gray-custom mt-1">{m.label}</p>
              </div>
            ))}
            <div>
              <p className="font-numeric font-bold tabular-nums text-3xl leading-none text-foreground">{career.matches}</p>
              <p className="text-[11px] uppercase tracking-wide text-gray-custom mt-1">Matches</p>
            </div>
            {topRank && (
              <div>
                <p className="font-numeric font-bold tabular-nums text-3xl leading-none text-primary-light">#{topRank.rank}</p>
                <p className="text-[11px] uppercase tracking-wide text-gray-custom mt-1">{topRank.category ? `${topRank.category.toLowerCase().replace(/^men$/i, "men's").replace(/^women$/i, "women's")} rank` : 'Rank'}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Per-tournament receipts (stat sports), expandable to match lines ── */}
      {tournaments.length > 0 && (
        <div className="mt-4">
          <p className="text-xs uppercase tracking-wide text-gray-custom mb-2">Competition record</p>
          <div className="space-y-2">
            {tournaments.map((t) => {
              const lines = (matchLines ?? []).filter((l) => l.tournamentId === t.id);
              const expanded = openTournament === t.id;
              return (
                <div key={t.id} className="bg-surface rounded-lg px-3 py-2">
                  <button
                    type="button"
                    onClick={() => lines.length && setOpenTournament(expanded ? null : t.id)}
                    disabled={!lines.length}
                    aria-expanded={expanded}
                    className="flex w-full items-start gap-2 text-left disabled:cursor-default"
                  >
                    <BadgeCheck size={14} className="text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-medium text-foreground/90 truncate">{t.name} <span className="text-gray-custom font-normal">· {yr(t.startDate)}</span></p>
                      <p className="text-xs text-gray-custom">{t.matches} match{t.matches === 1 ? '' : 'es'} · {(sport && RECEIPT[sport]) ? RECEIPT[sport](t.totals) : ''}</p>
                    </div>
                    {lines.length > 0 && (
                      <ChevronDown
                        size={14}
                        className={`shrink-0 mt-1 text-gray-custom transition-transform ${expanded ? 'rotate-180' : ''}`}
                      />
                    )}
                  </button>
                  {expanded && sport && (
                    <MatchLineTable
                      sport={sport} lines={lines} totals={t.totals}
                      averages={t.averages} matches={t.matches}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Competition record for non-stat sports (teams/tournaments, no per-player stats) ── */}
      {tournaments.length === 0 && competition.length > 0 && (
        <div className="mt-4">
          <p className="text-xs uppercase tracking-wide text-gray-custom mb-2">Competition record</p>
          <div className="space-y-2">
            {competition.map((c, i) => (
              <div key={i} className="flex items-start gap-2 bg-surface rounded-lg px-3 py-2">
                <BadgeCheck size={14} className="text-primary shrink-0 mt-0.5" />
                <div className="min-w-0 text-sm">
                  <p className="font-medium text-foreground/90 truncate">{c.tournament.name} <span className="text-gray-custom font-normal">· {yr(c.tournament.startDate)}</span></p>
                  <p className="text-xs text-gray-custom">{c.team.name} · {c.teamMatches} match{c.teamMatches === 1 ? '' : 'es'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Full record (all metrics + per-match averages) ── */}
      {career && (
        <div className="mt-3">
          <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 text-xs text-primary-light hover:text-primary transition-colors">
            <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} /> Full record
          </button>
          {open && (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(career.totals).map(([k, v]) => (
                <div key={k} className="bg-surface rounded-lg px-3 py-2">
                  <p className="font-numeric font-bold tabular-nums text-lg leading-none text-foreground">{v}</p>
                  <p className="text-[10px] uppercase tracking-wide text-gray-custom mt-0.5">{METRIC_LABEL[k] ?? k}</p>
                  <p className="text-[10px] text-gray-custom/70">{career.averages[k]}/match</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Athletics events */}
      {athleticsEvents.length > 0 && (
        <div className="mt-4">
          <p className="text-xs uppercase tracking-wide text-gray-custom mb-2">Events</p>
          <div className="flex flex-wrap gap-2">
            {athleticsEvents.map((e) => <span key={e} className="text-xs px-2.5 py-1 rounded-full bg-elevated text-foreground/80">{e}</span>)}
          </div>
        </div>
      )}

      {/* Trust-graded footer: achievements (self-reported) + endorsement count */}
      {achievements.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-xs uppercase tracking-wide text-gray-custom">Achievements</p>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-elevated text-gray-custom">Self-reported</span>
          </div>
          <ul className="space-y-1.5">
            {achievements.map((a, i) => (
              <li key={i} className="text-sm text-foreground/85 flex gap-2">
                <Award size={14} className="text-secondary shrink-0 mt-0.5" />
                <span className="min-w-0 break-words">{a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {endorsementCount > 0 && (
        <p className="mt-4 text-xs text-gray-custom flex items-center gap-1.5">
          <BadgeCheck size={13} className="text-primary" /> Endorsed by {endorsementCount} coach{endorsementCount === 1 ? '' : 'es'}
        </p>
      )}
    </div>
  );
}

/**
 * Performance Card on the athlete profile. Fetches /users/:id/performance-card
 * and renders the recorded (verified) hero band + per-tournament receipts +
 * full record, with a trust-graded footer (self-reported achievements,
 * endorsement count). Falls back to an honest empty state when there's no
 * recorded data yet. Renders nothing until the (auth'd) fetch resolves.
 */
export default function PerformanceCard({ id }: { id: string }) {
  const { data } = useQuery({
    queryKey: ['performance-card', id],
    queryFn: async () => (await api.get(`/users/${id}/performance-card`)).data as PCData,
    enabled: !!id,
  });
  if (!data) return null;
  return <PerformanceCardView data={data} />;
}
