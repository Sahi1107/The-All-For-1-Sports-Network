import prisma from '../../config/db';
import { ageFromDob } from '../provisionAthlete';
import { stateOnly } from '../og/eligibility';
import { signMediaUrl } from '../storage';
import { classifyMediaValue } from '../mediaUrlPolicy';
import { isStatSport, careerTotalsForUsers, tournamentTotalsForUser, type StatSport } from '../../data/careerStats';

// Data layer for shareable story cards. EVERYTHING here reads the persisted stat
// tables (BasketballStats / FootballStats / CricketStats) and the platform Match /
// PlayerRanking rows — never tracker state. That is the same source of truth as
// rankings, the Performance Card, and the (fixed) Excel export, so manually-entered
// box scores appear and corrections/un-publishes are reflected on the next render:
// nothing is cached, every card is built from a fresh read.

const MODEL_BY_SPORT: Record<StatSport, string> = {
  BASKETBALL: 'basketballStats',
  FOOTBALL: 'footballStats',
  CRICKET: 'cricketStats',
};

export const r1 = (n: number) => Math.round(n * 10) / 10;
export const per = (n: number, g: number) => (g ? r1(n / g) : 0);
export const pct = (n: number, d: number) => (d ? r1((n / d) * 100) : 0);

export const slugFor = (name: string, id: string) =>
  `${name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${id.replace(/-/g, '').slice(0, 12)}`;

// ── Age bands ─────────────────────────────────────────────────────────────────
export type AgeBand = 'BLOCKED' | 'MINOR' | 'ADULT';

/** Age from DOB when present (the stored `age` column is a stale snapshot),
 *  falling back to the column. Unknown age fails CLOSED into the minor band:
 *  initials avatar, state only — never a photo. */
export function bandFor(u: { dateOfBirth?: Date | null; age?: number | null; guardianManaged?: boolean | null; role?: string }): AgeBand {
  if (u.role !== 'ATHLETE' || u.guardianManaged) return 'BLOCKED';
  const age = u.dateOfBirth ? ageFromDob(u.dateOfBirth) : u.age ?? null;
  if (age != null && age < 13) return 'BLOCKED';
  return age != null && age >= 18 ? 'ADULT' : 'MINOR';
}

export function ageGroup(u: { dateOfBirth?: Date | null; age?: number | null }): string {
  const age = u.dateOfBirth ? ageFromDob(u.dateOfBirth) : u.age ?? null;
  if (age == null || age >= 18) return 'OPEN';
  return age <= 13 ? 'U-14' : age <= 15 ? 'U-16' : 'U-18';
}

// ── Identity (name, initials avatar or photo, state) ──────────────────────────
// Initials + duotone palette mirror the app's Avatar component.
const PALETTE: [string, string][] = [
  ['#6366f1', '#4338ca'], ['#0ea5e9', '#0369a1'], ['#14b8a6', '#0f766e'], ['#10b981', '#047857'],
  ['#f59e0b', '#b45309'], ['#f97316', '#c2410c'], ['#f43f5e', '#be123c'], ['#d946ef', '#a21caf'],
  ['#8b5cf6', '#6d28d9'], ['#06b6d4', '#0e7490'],
];

export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => w && !/^\d+$/.test(w));
  if (!words.length) return '•';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function gradientFor(name: string): [string, string] {
  let hash = 0;
  for (const c of name) hash = (hash + c.charCodeAt(0)) % 997;
  return PALETTE[hash % PALETTE.length];
}

export interface CardIdentity {
  name: string;
  initials: string;
  gradient: [string, string];
  avatarDataUri: string | null; // ADULT band only, best-effort
  state: string | null;
  position: string | null;
  verified: boolean;
  slug: string;
  sub: string; // "GUARD · CORLIM HAWKS · GOA"
}

const AVATAR_MAX_BYTES = 4 * 1024 * 1024;

/** Whether a resolved avatar URL may be fetched server-side. Defence in depth:
 *  the column is guarded on write (services/mediaUrlPolicy, enforced in
 *  config/db), but this fetch reaches the network from inside the VPC, so it
 *  re-checks rather than trusting the stored value — including legacy rows
 *  written before that guard existed. Exported for tests. */
export function avatarFetchAllowed(url: string): boolean {
  return classifyMediaValue(url) === 'allowed-host';
}

/** Fetch the avatar into a data URI so satori can embed it. Best-effort with a
 *  host allowlist, timeout and size cap; any failure falls back to initials. */
async function avatarDataUri(avatar: string | null): Promise<string | null> {
  if (!avatar) return null;
  try {
    const url = await signMediaUrl(avatar);
    if (!url || !avatarFetchAllowed(url)) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const type = res.headers.get('content-type') ?? 'image/jpeg';
    if (!/image\/(png|jpe?g|webp)/.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > AVATAR_MAX_BYTES) return null;
    // resvg rasterizes PNG/JPEG; webp is not reliable — skip it.
    if (/webp/.test(type)) return null;
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

export interface CardUser {
  id: string; name: string; role: string; sport: string | null; position: string | null;
  location: string | null; avatar: string | null; verified: boolean;
  age: number | null; dateOfBirth: Date | null; guardianManaged: boolean;
}

export async function loadCardUser(userId: string): Promise<CardUser | null> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, role: true, sport: true, position: true, location: true,
      avatar: true, verified: true, age: true, dateOfBirth: true, guardianManaged: true,
    },
  });
}

export async function identityFor(u: CardUser, band: AgeBand, club: string | null): Promise<CardIdentity> {
  const state = stateOnly(u.location);
  const sub = [u.position?.toUpperCase(), club?.toUpperCase(), state?.toUpperCase()].filter(Boolean).join(' · ');
  return {
    name: u.name,
    initials: initialsOf(u.name),
    gradient: gradientFor(u.name),
    avatarDataUri: band === 'ADULT' ? await avatarDataUri(u.avatar) : null,
    state, position: u.position, verified: u.verified, slug: slugFor(u.name, u.id), sub,
  };
}

/** The player's most recent accepted team — the "club" line on cards. */
export async function clubFor(userId: string): Promise<string | null> {
  const m = await prisma.teamMember.findFirst({
    where: { userId, status: 'ACCEPTED' },
    orderBy: { joinedAt: 'desc' },
    select: { team: { select: { name: true } } },
  });
  return m?.team?.name ?? null;
}

const fmtDate = (d: Date) =>
  `${d.getUTCDate()} ${d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }).toUpperCase()}`;

// ── Match card ────────────────────────────────────────────────────────────────
export interface MatchCardData {
  hero: { value: number; label: string };
  rail: { value: number; label: string }[];
  roundLine: string;      // "SEMI-FINAL WIN"
  metaLine: string;       // "GOA MONSOON LEAGUE · 18 AUG"
  playerTeam: { name: string; score: number };
  opponent: { name: string; score: number };
  result: 'W' | 'L' | 'D';
}

const MATCH_SHAPE: Record<StatSport, { hero: [string, string]; rail: [string, string][] }> = {
  BASKETBALL: { hero: ['points', 'POINTS'], rail: [['rebounds', 'REBOUNDS'], ['assists', 'ASSISTS'], ['steals', 'STEALS']] },
  FOOTBALL: { hero: ['goals', 'GOALS'], rail: [['assists', 'ASSISTS'], ['shots', 'SHOTS'], ['tackles', 'TACKLES']] },
  CRICKET: { hero: ['runs', 'RUNS'], rail: [['wickets', 'WICKETS'], ['fours', 'FOURS'], ['sixes', 'SIXES']] },
};

/** The player's own line in ONE match, from the persisted stat row. Returns null
 *  when the player has no stat row in that match (or the match has no result) —
 *  which is also what an un-published match looks like: its rows are gone. */
export async function matchCardData(userId: string, matchId: string, sport: StatSport): Promise<MatchCardData | null> {
  const model = (prisma as any)[MODEL_BY_SPORT[sport]];
  const row = await model.findFirst({
    where: { userId, matchId },
    include: {
      match: {
        select: {
          homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true,
          round: true, matchDate: true,
          homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } },
          tournament: { select: { name: true } },
        },
      },
    },
  });
  if (!row?.match || row.match.homeScore == null || row.match.awayScore == null) return null;
  const m = row.match;

  const onHome = !!(await prisma.teamMember.findFirst({ where: { userId, teamId: m.homeTeamId }, select: { id: true } }));
  const onAway = onHome ? false : !!(await prisma.teamMember.findFirst({ where: { userId, teamId: m.awayTeamId }, select: { id: true } }));
  const home = onHome || !onAway; // roster gap falls back to home, like the export
  const mine = home ? { name: m.homeTeam?.name ?? 'HOME', score: m.homeScore } : { name: m.awayTeam?.name ?? 'AWAY', score: m.awayScore };
  const theirs = home ? { name: m.awayTeam?.name ?? 'AWAY', score: m.awayScore } : { name: m.homeTeam?.name ?? 'HOME', score: m.homeScore };
  const result: 'W' | 'L' | 'D' = mine.score > theirs.score ? 'W' : mine.score < theirs.score ? 'L' : 'D';

  const shape = MATCH_SHAPE[sport];
  return {
    hero: { value: Number(row[shape.hero[0]] ?? 0), label: shape.hero[1] },
    rail: shape.rail.map(([k, l]) => ({ value: Number(row[k] ?? 0), label: l })),
    roundLine: `${(m.round ?? 'MATCH').toUpperCase()}${result === 'W' ? ' WIN' : result === 'D' ? ' DRAW' : ''}`,
    metaLine: `${(m.tournament?.name ?? '').toUpperCase()} · ${fmtDate(m.matchDate)}`,
    playerTeam: mine, opponent: theirs, result,
  };
}

// ── Tournament summary card ───────────────────────────────────────────────────
export interface TournamentCardData {
  tournamentName: string;
  datesLine: string;      // "JUL-AUG 2026" or the start year
  games: number;
  record: string | null;  // "5-2" from the player's team results, null if unrostered
  tiles: { value: string; label: string; sub: string }[];
}

const monthYear = (d: Date) => d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }).toUpperCase();

export async function tournamentCardData(userId: string, tournamentId: string, sport: StatSport): Promise<TournamentCardData | null> {
  const model = (prisma as any)[MODEL_BY_SPORT[sport]];
  const [tournament, rows] = await Promise.all([
    prisma.tournament.findUnique({ where: { id: tournamentId }, select: { name: true, startDate: true, endDate: true } }),
    model.findMany({ where: { userId, tournamentId } }),
  ]);
  if (!tournament || !rows.length) return null;
  const games = rows.length;
  const sum = (k: string) => rows.reduce((t: number, r: Record<string, unknown>) => t + Number(r[k] ?? 0), 0);

  let tiles: TournamentCardData['tiles'];
  if (sport === 'BASKETBALL') {
    const fg = sum('twoPointers') + sum('threePointers');
    tiles = [
      { value: String(per(sum('points'), games)), label: 'POINTS / GAME', sub: `${sum('points')} total` },
      { value: String(per(sum('rebounds'), games)), label: 'REBOUNDS / GAME', sub: `${sum('rebounds')} total` },
      { value: String(per(sum('assists'), games)), label: 'ASSISTS / GAME', sub: `${sum('assists')} total` },
      { value: `${pct(fg, sum('fieldGoalAttempts'))}%`, label: 'FIELD GOAL', sub: `${fg} / ${sum('fieldGoalAttempts')} made` },
    ];
  } else if (sport === 'FOOTBALL') {
    tiles = [
      { value: String(sum('goals')), label: 'GOALS', sub: `${per(sum('goals'), games)} per game` },
      { value: String(sum('assists')), label: 'ASSISTS', sub: `${per(sum('assists'), games)} per game` },
      { value: String(sum('tackles')), label: 'TACKLES', sub: `${per(sum('tackles'), games)} per game` },
      { value: String(sum('saves')), label: 'SAVES', sub: `${per(sum('saves'), games)} per game` },
    ];
  } else {
    tiles = [
      { value: String(sum('runs')), label: 'RUNS', sub: `${per(sum('runs'), games)} per game` },
      { value: String(sum('wickets')), label: 'WICKETS', sub: `${per(sum('wickets'), games)} per game` },
      { value: String(sum('fours')), label: 'FOURS', sub: `${sum('sixes')} sixes` },
      { value: String(pct(sum('runs'), sum('ballsFaced'))), label: 'STRIKE RATE', sub: `${sum('ballsFaced')} balls` },
    ];
  }

  // W-L from the player's team results in this tournament (persisted Match rows).
  let record: string | null = null;
  const membership = await prisma.teamMember.findFirst({
    where: { userId, team: { tournamentId } },
    select: { teamId: true },
  });
  if (membership) {
    const matches = await prisma.match.findMany({
      where: {
        tournamentId, status: 'COMPLETED', homeScore: { not: null }, awayScore: { not: null },
        OR: [{ homeTeamId: membership.teamId }, { awayTeamId: membership.teamId }],
      },
      select: { homeTeamId: true, homeScore: true, awayScore: true },
    });
    let w = 0, l = 0, d = 0;
    for (const m of matches) {
      const mine = m.homeTeamId === membership.teamId ? m.homeScore! : m.awayScore!;
      const theirs = m.homeTeamId === membership.teamId ? m.awayScore! : m.homeScore!;
      if (mine > theirs) w++; else if (mine < theirs) l++; else d++;
    }
    record = `${w}-${l}${d ? `-${d}` : ''}`;
  }

  const start = tournament.startDate ? new Date(tournament.startDate) : null;
  const end = tournament.endDate ? new Date(tournament.endDate) : null;
  const datesLine = start
    ? `${monthYear(start)}${end && monthYear(end) !== monthYear(start) ? `-${monthYear(end)}` : ''} ${start.getUTCFullYear()}`
    : '';
  return { tournamentName: tournament.name, datesLine, games, record, tiles };
}

// ── Career (Performance Card) ─────────────────────────────────────────────────
export interface CareerCardData {
  sinceYear: number | null;
  matches: number;
  heroCells: { value: string; label: string }[];
  receipts: { name: string; meta: string; right: string }[];
  splitsLine: string | null;   // basketball shooting splits
  totalLine: string;           // "612 CAREER PTS"
}

const CAREER_HERO: Record<StatSport, [string, string][]> = {
  BASKETBALL: [['points', 'PTS / GAME'], ['rebounds', 'REB / GAME'], ['assists', 'AST / GAME']],
  FOOTBALL: [['goals', 'GOALS / GAME'], ['assists', 'AST / GAME'], ['tackles', 'TKL / GAME']],
  CRICKET: [['runs', 'RUNS / GAME'], ['wickets', 'WKTS / GAME'], ['catches', 'CATCHES / GAME']],
};
const CAREER_RECEIPT: Record<StatSport, [string, string][]> = {
  BASKETBALL: [['points', 'PTS'], ['rebounds', 'REB']],
  FOOTBALL: [['goals', 'G'], ['assists', 'A']],
  CRICKET: [['runs', 'R'], ['wickets', 'W']],
};
const CAREER_TOTAL: Record<StatSport, [string, string]> = {
  BASKETBALL: ['points', 'CAREER PTS'],
  FOOTBALL: ['goals', 'CAREER GOALS'],
  CRICKET: ['runs', 'CAREER RUNS'],
};

export async function careerCardData(userId: string, sport: StatSport): Promise<CareerCardData | null> {
  const [career, perTournament] = await Promise.all([
    careerTotalsForUsers(sport, [userId]),
    tournamentTotalsForUser(sport, userId),
  ]);
  const c = career.get(userId);
  if (!c || !c.matches) return null;

  const ids = perTournament.map((t) => t.tournamentId);
  const tournaments = await prisma.tournament.findMany({
    where: { id: { in: ids } }, select: { id: true, name: true, startDate: true },
  });
  const byId = new Map(tournaments.map((t) => [t.id, t]));
  const dated = perTournament
    .map((t) => ({ ...t, name: byId.get(t.tournamentId)?.name ?? '', start: byId.get(t.tournamentId)?.startDate ?? null }))
    .sort((a, b) => (b.start ? new Date(b.start).getTime() : 0) - (a.start ? new Date(a.start).getTime() : 0));

  const receipts = dated.slice(0, 3).map((t) => ({
    name: t.name,
    meta: `${t.start ? new Date(t.start).getUTCFullYear() + ' · ' : ''}${t.matches} matches`,
    right: CAREER_RECEIPT[sport].map(([k, l]) => `${per(t.totals[k] ?? 0, t.matches)} ${l}`).join(' · '),
  }));

  let splitsLine: string | null = null;
  if (sport === 'BASKETBALL') {
    const fg = (c.totals.twoPointers ?? 0) + (c.totals.threePointers ?? 0);
    splitsLine = `FG ${pct(fg, c.totals.fieldGoalAttempts ?? 0)}% · 3P ${pct(c.totals.threePointers ?? 0, c.totals.threePointAttempts ?? 0)}% · FT ${pct(c.totals.freeThrows ?? 0, c.totals.freeThrowAttempts ?? 0)}%`;
  }

  const sinceYear = dated.length ? Math.min(...dated.filter((t) => t.start).map((t) => new Date(t.start!).getUTCFullYear())) : null;
  const [totalKey, totalLabel] = CAREER_TOTAL[sport];
  return {
    sinceYear, matches: c.matches,
    heroCells: [
      { value: String(c.matches), label: 'MATCHES' },
      ...CAREER_HERO[sport].map(([k, l]) => ({ value: String(per(c.totals[k] ?? 0, c.matches)), label: l })),
    ],
    receipts, splitsLine,
    totalLine: `${c.totals[totalKey] ?? 0} ${totalLabel}`,
  };
}

// ── Ranking card ──────────────────────────────────────────────────────────────
export interface RankingCardData {
  rank: number;
  boardLabel: string;      // "GUARD BOARD" / "OVERALL BOARD"
  tournamentLine: string;  // tournament name uppercased
  boardSize: number;
  score: number;           // normalized 0-100
}

export async function rankingCardData(userId: string): Promise<RankingCardData | null> {
  const ranking = await prisma.playerRanking.findFirst({
    where: { userId },
    orderBy: { calculatedAt: 'desc' },
    select: { rank: true, score: true, category: true, sport: true, tournamentId: true, tournament: { select: { name: true } } },
  });
  if (!ranking) return null;
  const boardSize = await prisma.playerRanking.count({
    where: { tournamentId: ranking.tournamentId, category: ranking.category, sport: ranking.sport },
  });
  const cat = ranking.category ?? 'OVERALL';
  return {
    rank: ranking.rank,
    boardLabel: `${cat === 'OVERALL' ? 'OVERALL' : cat} BOARD`,
    tournamentLine: (ranking.tournament?.name ?? '').toUpperCase(),
    boardSize,
    score: r1(ranking.score),
  };
}

// ── Profile card ──────────────────────────────────────────────────────────────
export interface ProfileCardData {
  firstLine: string;
  secondLine: string;       // may be '' for single-word names
  metaLine: string;         // "GUARD · CORLIM HAWKS · U-18 · GOA"
  chips: { value: string; label: string }[];
  dayOne: boolean;          // no verified record yet → THE RECORD STARTS HERE
  seasonLine: string;
  sportLabel: string | null;
}

const PROFILE_HERO_AVG: Record<StatSport, [string, string]> = {
  BASKETBALL: ['points', 'PTS / GAME'],
  FOOTBALL: ['goals', 'GOALS / GAME'],
  CRICKET: ['runs', 'RUNS / GAME'],
};

export async function profileCardData(u: CardUser, club: string | null): Promise<ProfileCardData> {
  const words = u.name.trim().split(/\s+/);
  const firstLine = (words[0] ?? '').toUpperCase();
  const secondLine = words.slice(1).join(' ').toUpperCase();

  const now = new Date();
  const seasonLine = `SEASON ${now.getUTCFullYear()}-${String((now.getUTCFullYear() + 1) % 100).padStart(2, '0')}`;
  const metaBits = [u.position?.toUpperCase(), club?.toUpperCase(), ageGroup(u), stateOnly(u.location)?.toUpperCase()].filter(Boolean);

  const base: ProfileCardData = {
    firstLine, secondLine, metaLine: metaBits.join(' · '), chips: [], dayOne: true, seasonLine,
    sportLabel: u.sport ? u.sport.replace(/_/g, ' ').toUpperCase() : null,
  };
  if (!u.sport || !isStatSport(u.sport)) return base;

  const sport = u.sport as StatSport;
  const [career, ranking] = await Promise.all([careerTotalsForUsers(sport, [u.id]), rankingCardData(u.id)]);
  const c = career.get(u.id);
  if (!c || !c.matches) return base;

  const [heroKey, heroLabel] = PROFILE_HERO_AVG[sport];
  const chips = [
    { value: String(c.matches), label: 'MATCHES' },
    { value: String(per(c.totals[heroKey] ?? 0, c.matches)), label: heroLabel },
  ];
  if (ranking) chips.push({ value: `#${ranking.rank}`, label: ranking.boardLabel });
  return { ...base, chips, dayOne: false };
}
