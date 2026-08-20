import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { BadgeCheck, Award, ChevronDown } from 'lucide-react';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import ShareCardButton from './ShareCardButton';

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
/** Per-tournament summary. Averages, like the rest of the card — the match count
 *  sits immediately before it, so "per match" is spelled out to keep the two
 *  numbers from reading as a total. */
const RECEIPT: Record<string, (a: Record<string, number>) => string> = {
  FOOTBALL:   (a) => `${a.goals} G · ${a.assists} A per match`,
  BASKETBALL: (a) => `${a.points} PTS · ${a.rebounds} REB per match`,
  CRICKET:    (a) => `${a.runs} runs · ${a.wickets} wkts per match`,
};
const METRIC_LABEL: Record<string, string> = {
  goals: 'Goals', assists: 'Assists', shots: 'Shots', passes: 'Passes', tackles: 'Tackles', saves: 'Saves',
  points: 'Points', rebounds: 'Rebounds', steals: 'Steals', blocks: 'Blocks',
  runs: 'Runs', wickets: 'Wickets', fours: 'Fours', sixes: 'Sixes', catches: 'Catches', minutesPlayed: 'Minutes',
};
const yr = (d: string) => (d ? String(new Date(d).getFullYear()) : '');

// Metrics that must not appear as their own tile in the full record. Minutes
// aren't a performance figure a scout reads off a card, and the raw attempt
// counts are shown as the denominator of the shooting percentages below rather
// than as three more bare numbers.
const HIDDEN_METRICS = new Set([
  'minutesPlayed', 'fieldGoalAttempts', 'threePointAttempts', 'freeThrowAttempts',
]);

/** made/attempted as a percentage, or "—" when nothing was attempted. Never 0%:
 *  a player who took no shots didn't shoot 0%, and stats published before
 *  attempts were persisted have none — both must read as "no data". */
function shootingPct(made: number, attempts: number): string {
  if (!attempts || attempts <= 0) return '—';
  return `${Math.round((made / attempts) * 1000) / 10}%`;
}

/** Shooting tiles for the full record. Percentages are RATIOS — averaging one
 *  per match is meaningless, so these carry makes/attempts underneath instead of
 *  the "/match" line every counting stat gets. */
function shootingTiles(totals: Record<string, number>) {
  const fgm = (totals.twoPointers ?? 0) + (totals.threePointers ?? 0);
  const fga = totals.fieldGoalAttempts ?? 0;
  const tpm = totals.threePointers ?? 0;
  const tpa = totals.threePointAttempts ?? 0;
  return [
    { key: 'fgPct', label: 'FG%', value: shootingPct(fgm, fga), detail: `${fgm} / ${fga}` },
    { key: 'tpPct', label: '3PT%', value: shootingPct(tpm, tpa), detail: `${tpm} / ${tpa}` },
  ];
}

// Per-match box-score columns. Tournament leaderboards deliberately show only
// averages, so this is where the raw per-game numbers behind them live.
const MATCH_COLS: Record<string, { key: string; label: string }[]> = {
  BASKETBALL: [
    { key: 'points', label: 'PTS' },
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
function MatchLineTable({ sport, lines, totals, averages, matches, own = false }: {
  sport: string; lines: MatchLine[]; totals: Record<string, number>;
  averages?: Record<string, number>; matches: number; own?: boolean;
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
            {own && <th className="py-1 pl-1.5" aria-label="Share" />}
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
              {own && (
                <td className="py-1 pl-1.5 text-right">
                  <ShareCardButton
                    path={`/share-cards/match/${l.matchId}`}
                    filename="match-card.png"
                    label=""
                    type="match"
                    className="inline-flex items-center p-1.5 rounded-md text-gray-custom hover:text-primary transition-colors"
                  />
                </td>
              )}
            </tr>
          ))}
          <tr className="border-t border-line font-semibold text-foreground">
            <td className="py-1 pr-2">Total · {matches} match{matches === 1 ? '' : 'es'}</td>
            {cols.map((c) => <td key={c.key} className="px-1.5 py-1 text-right">{num(totals[c.key] ?? 0)}</td>)}
            {own && <td />}
          </tr>
          {averages && matches > 1 && (
            <tr className="text-gray-custom">
              <td className="py-1 pr-2">Per game</td>
              {cols.map((c) => <td key={c.key} className="px-1.5 py-1 text-right">{num(averages[c.key] ?? 0)}</td>)}
              {own && <td />}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Pure presentational card — takes the /performance-card payload. */
export function PerformanceCardView({ data, initialOpen = false, own = false }: { data: PCData; initialOpen?: boolean; own?: boolean }) {
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
          <div className="flex items-center justify-between mb-3">
            <p className="flex items-center gap-1.5 font-display font-bold tracking-[0.1em] text-[10px] text-primary/90">
              <BadgeCheck size={12} /> RECORDED BY ALL FOR 1
            </p>
            {own && (
              <div className="flex gap-1.5">
                <ShareCardButton path="/share-cards/career" filename="performance-card.png" label="Share" type="career" />
                {topRank && <ShareCardButton path="/share-cards/ranking" filename="ranking-card.png" label="Rank" type="ranking" />}
              </div>
            )}
          </div>
          {/* PER-MATCH, not career totals. A total is a function of how many
              games someone happened to play, so it ranks a squad player who
              turned out ten times above a star who played two — the opposite of
              what a scout reads this band for. Averages compare like with like,
              and are what the ranking boards score on. The total is still one tap
              away in Full record. */}
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {hero.map((m) => (
              <div key={m.key}>
                <p className="font-numeric font-bold tabular-nums text-3xl leading-none text-foreground">{career.averages[m.key] ?? 0}</p>
                <p className="text-[11px] uppercase tracking-wide text-gray-custom mt-1">{m.label} / match</p>
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
                      <p className="text-xs text-gray-custom">{t.matches} match{t.matches === 1 ? '' : 'es'} · {(sport && RECEIPT[sport] && t.averages) ? RECEIPT[sport](t.averages) : ''}</p>
                    </div>
                    {lines.length > 0 && (
                      <ChevronDown
                        size={14}
                        className={`shrink-0 mt-1 text-gray-custom transition-transform ${expanded ? 'rotate-180' : ''}`}
                      />
                    )}
                  </button>
                  {expanded && sport && (
                    <>
                      {own && (
                        <div className="mt-2 flex justify-end">
                          <ShareCardButton
                            path={`/share-cards/tournament/${t.id}`}
                            filename="tournament-card.png"
                            label="Share tournament card"
                            type="tournament"
                          />
                        </div>
                      )}
                      <MatchLineTable
                        sport={sport} lines={lines} totals={t.totals}
                        averages={t.averages} matches={t.matches} own={own}
                      />
                    </>
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
              {/* Average leads, total underneath — the inverse of what a box
                  score prints, because per-match is the comparable figure. */}
              {Object.entries(career.totals)
                .filter(([k]) => !HIDDEN_METRICS.has(k))
                .map(([k, v]) => (
                  <div key={k} className="bg-surface rounded-lg px-3 py-2">
                    <p className="font-numeric font-bold tabular-nums text-lg leading-none text-foreground">{career.averages[k] ?? 0}</p>
                    <p className="text-[10px] uppercase tracking-wide text-gray-custom mt-0.5">{METRIC_LABEL[k] ?? k} / match</p>
                    <p className="text-[10px] text-gray-custom/70">{v} total</p>
                  </div>
                ))}
              {sport === 'BASKETBALL' && shootingTiles(career.totals).map((t) => (
                <div key={t.key} className="bg-surface rounded-lg px-3 py-2">
                  <p className="font-numeric font-bold tabular-nums text-lg leading-none text-foreground">{t.value}</p>
                  <p className="text-[10px] uppercase tracking-wide text-gray-custom mt-0.5">{t.label}</p>
                  <p className="text-[10px] text-gray-custom/70">{t.detail}</p>
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
  const { user: me } = useAuth();
  const { data } = useQuery({
    queryKey: ['performance-card', id],
    queryFn: async () => (await api.get(`/users/${id}/performance-card`)).data as PCData,
    enabled: !!id,
  });
  if (!data) return null;
  // Share buttons only on the athlete's own card — the card endpoints are
  // self-only on the server, so showing them to anyone else would just 404.
  return <PerformanceCardView data={data} own={me?.id === id} />;
}
