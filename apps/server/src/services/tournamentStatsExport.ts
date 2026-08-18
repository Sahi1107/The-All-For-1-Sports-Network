import * as XLSX from 'xlsx';
import prisma from '../config/db';

// Tournament stats workbook, built from the PERSISTED stat tables (BasketballStats
// / FootballStats), which is where BOTH tracker-recorded and manually-entered games
// land via the shared writeMatchPlayerStats sink. The old client export read the
// ephemeral tracker `state`, so manual box scores (state = null) were invisible.
// Reading the tables instead makes every published game appear regardless of how it
// was entered — the same source rankings and the Performance Card already use.

const r1 = (n: number) => Math.round(n * 10) / 10;              // one-decimal
const per = (n: number, g: number) => (g ? r1(n / g) : 0);      // per-game
const pct = (n: number, d: number) => (d ? r1((n / d) * 100) : 0); // percentage, 1dp

// ── Fetched shape ─────────────────────────────────────────────────────────────
type Sport = 'BASKETBALL' | 'FOOTBALL';

interface BbRow {
  userId: string; points: number; rebounds: number; offRebounds: number; defRebounds: number;
  assists: number; steals: number; blocks: number; twoPointers: number; threePointers: number;
  freeThrows: number; fieldGoalAttempts: number; threePointAttempts: number; freeThrowAttempts: number;
  turnovers: number; personalFouls: number; minutesPlayed: number;
}
interface FbRow {
  userId: string; goals: number; assists: number; shots: number; passes: number; tackles: number;
  saves: number; yellowCards: number; redCards: number; minutesPlayed: number;
}
interface ExportMatch {
  id: string; round: string | null; matchDate: Date; statsSource: string;
  homeTeamId: string; awayTeamId: string; homeTeamName: string; awayTeamName: string;
  homeScore: number | null; awayScore: number | null;
  bb: BbRow[]; fb: FbRow[];
}
export interface ExportData {
  tournamentName: string;
  sport: Sport;
  variant: string;
  matches: ExportMatch[];
  rosters: Map<string, Set<string>>;   // teamId → member userIds
  playerName: Map<string, string>;     // userId → name
}

/** Which team a player featured for in a match — resolved from team rosters, since
 *  the stat row itself carries no teamId. Falls back to the home team if a player
 *  isn't on either roster (a rare roster gap), so they still appear in the game. */
function teamOf(userId: string, m: ExportMatch, rosters: Map<string, Set<string>>): string {
  if (rosters.get(m.homeTeamId)?.has(userId)) return m.homeTeamId;
  if (rosters.get(m.awayTeamId)?.has(userId)) return m.awayTeamId;
  return m.homeTeamId;
}

export async function fetchExportData(tournamentId: string): Promise<ExportData> {
  const tournament = await prisma.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
    select: { name: true, sport: true, variant: true },
  });
  const sport = tournament.sport as Sport;

  const rawMatches = await prisma.match.findMany({
    where: { tournamentId, status: 'COMPLETED', homeScore: { not: null }, awayScore: { not: null } },
    orderBy: { matchDate: 'asc' },
    select: {
      id: true, round: true, matchDate: true, statsSource: true,
      homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true,
      homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } },
      basketballStats: sport === 'BASKETBALL',
      footballStats: sport === 'FOOTBALL',
    },
  });

  const matches: ExportMatch[] = rawMatches.map((m) => ({
    id: m.id, round: m.round, matchDate: m.matchDate, statsSource: m.statsSource,
    homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId,
    homeTeamName: m.homeTeam?.name ?? 'Home', awayTeamName: m.awayTeam?.name ?? 'Away',
    homeScore: m.homeScore, awayScore: m.awayScore,
    bb: (m as { basketballStats?: BbRow[] }).basketballStats ?? [],
    fb: (m as { footballStats?: FbRow[] }).footballStats ?? [],
  }));

  // Rosters for every team that appears, to map players → their team in each game.
  const teamIds = [...new Set(matches.flatMap((m) => [m.homeTeamId, m.awayTeamId]))];
  const members = await prisma.teamMember.findMany({
    where: { teamId: { in: teamIds } }, select: { teamId: true, userId: true },
  });
  const rosters = new Map<string, Set<string>>();
  for (const mem of members) {
    (rosters.get(mem.teamId) ?? rosters.set(mem.teamId, new Set()).get(mem.teamId)!).add(mem.userId);
  }

  const userIds = [...new Set(matches.flatMap((m) => [...m.bb, ...m.fb].map((r) => r.userId)))];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
  const playerName = new Map(users.map((u) => [u.id, u.name] as const));

  return { tournamentName: tournament.name, sport, variant: tournament.variant, matches, rosters, playerName };
}

// ── Basketball aggregation ────────────────────────────────────────────────────
interface BbAgg {
  userId: string; name: string; teamId: string; teamName: string; games: number;
  min: number; pts: number; oreb: number; dreb: number; reb: number; ast: number; stl: number;
  blk: number; to: number; pf: number; fg: number; fga: number; tp: number; tpa: number; ft: number; fta: number;
}
const teamNameOf = (teamId: string, d: ExportData) => {
  const m = d.matches.find((x) => x.homeTeamId === teamId || x.awayTeamId === teamId);
  return m ? (m.homeTeamId === teamId ? m.homeTeamName : m.awayTeamName) : '';
};

/** Per-player tournament aggregate. games = distinct matches with a stat row —
 *  the SAME count rankings and the Performance Card use, so a manual game counts. */
export function aggregateBasketball(d: ExportData): Map<string, BbAgg> {
  const agg = new Map<string, BbAgg>();
  for (const m of d.matches) {
    for (const s of m.bb) {
      const teamId = teamOf(s.userId, m, d.rosters);
      const t = agg.get(s.userId) ?? {
        userId: s.userId, name: d.playerName.get(s.userId) ?? s.userId, teamId, teamName: teamNameOf(teamId, d),
        games: 0, min: 0, pts: 0, oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0,
        fg: 0, fga: 0, tp: 0, tpa: 0, ft: 0, fta: 0,
      };
      t.games += 1; t.min += s.minutesPlayed; t.pts += s.points;
      t.oreb += s.offRebounds; t.dreb += s.defRebounds; t.reb += s.rebounds;
      t.ast += s.assists; t.stl += s.steals; t.blk += s.blocks; t.to += s.turnovers; t.pf += s.personalFouls;
      t.fg += s.twoPointers + s.threePointers; t.fga += s.fieldGoalAttempts;
      t.tp += s.threePointers; t.tpa += s.threePointAttempts; t.ft += s.freeThrows; t.fta += s.freeThrowAttempts;
      agg.set(s.userId, t);
    }
  }
  return agg;
}

/** Games-played summary — the number the fix is about. `bySource` shows how many
 *  games each entry method contributed; `manualGames` is what the old export dropped. */
export function gamesPlayedSummary(d: ExportData) {
  const bySource: Record<string, number> = {};
  for (const m of d.matches) bySource[m.statsSource] = (bySource[m.statsSource] ?? 0) + 1;
  return {
    totalGames: d.matches.length,
    trackerGames: bySource.TRACKER ?? 0,
    manualGames: bySource.MANUAL ?? 0,
    bySource,
  };
}

const DEEP = (d: ExportData) => (d.variant === 'THREE_V_THREE' ? '2P' : '3P');

// ── Workbook ──────────────────────────────────────────────────────────────────
function nameSheet() {
  const used = new Set<string>();
  return (name: string, suffix = '') => {
    const clean = name.replace(/[\\/?*[\]:]/g, '').trim();
    let out = (clean.slice(0, 31 - suffix.length) || 'Sheet') + suffix;
    for (let i = 2; used.has(out.toLowerCase()); i++) {
      const tag = ` ${i}`;
      out = (clean.slice(0, 31 - suffix.length - tag.length) || 'Sheet') + suffix + tag;
    }
    used.add(out.toLowerCase());
    return out;
  };
}
const withCols = (ws: XLSX.WorkSheet, w: number[]) => { ws['!cols'] = w.map((wch) => ({ wch })); return ws; };

function buildBasketballWorkbook(d: ExportData): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const sheet = nameSheet();
  const deep = DEEP(d);
  const agg = aggregateBasketball(d);
  const players = [...agg.values()];

  // ── Leaders — top 10 per category (per-game, with the total alongside) ──
  const leaderRows: (string | number)[][] = [['LEADERS', d.tournamentName], [], ['Category', 'Rank', 'Player', 'Team', 'Per game', 'Total', 'GP']];
  const CATS: { label: string; k: keyof BbAgg }[] = [
    { label: 'Points', k: 'pts' }, { label: 'Rebounds', k: 'reb' }, { label: 'Assists', k: 'ast' },
    { label: 'Steals', k: 'stl' }, { label: 'Blocks', k: 'blk' }, { label: `${deep}M`, k: 'tp' }, { label: 'Minutes', k: 'min' },
  ];
  for (const c of CATS) {
    const top = [...players].filter((p) => (p[c.k] as number) > 0)
      .sort((a, b) => per(b[c.k] as number, b.games) - per(a[c.k] as number, a.games)).slice(0, 10);
    top.forEach((p, i) => leaderRows.push([i === 0 ? c.label : '', i + 1, p.name, p.teamName, per(p[c.k] as number, p.games), r1(p[c.k] as number), p.games]));
    if (top.length) leaderRows.push([]);
  }
  XLSX.utils.book_append_sheet(wb, withCols(XLSX.utils.aoa_to_sheet(leaderRows), [12, 5, 22, 20, 9, 8, 5]), sheet('Leaders'));

  // ── Player Totals ──
  const totals = [...players].sort((a, b) => b.pts - a.pts).map((r) => ({
    Player: r.name, Team: r.teamName, GP: r.games, MIN: r1(r.min), PTS: r.pts, OREB: r.oreb, DREB: r.dreb, REB: r.reb,
    AST: r.ast, STL: r.stl, BLK: r.blk, TO: r.to, PF: r.pf, FG: r.fg, FGA: r.fga, 'FG%': pct(r.fg, r.fga),
    [deep]: r.tp, [`${deep}A`]: r.tpa, [`${deep}%`]: pct(r.tp, r.tpa), FT: r.ft, FTA: r.fta, 'FT%': pct(r.ft, r.fta),
  }));
  XLSX.utils.book_append_sheet(wb, withCols(XLSX.utils.json_to_sheet(totals), [22, 20, 5, 7, 6, 6, 6, 6, 6, 6, 6, 6, 5, 5, 6, 7, 5, 6, 7, 5, 6, 7]), sheet('Player Totals'));

  // ── Player Averages ──
  const averages = [...players].sort((a, b) => per(b.pts, b.games) - per(a.pts, a.games)).map((r) => ({
    Player: r.name, Team: r.teamName, GP: r.games, MPG: per(r.min, r.games), PPG: per(r.pts, r.games),
    RPG: per(r.reb, r.games), APG: per(r.ast, r.games), SPG: per(r.stl, r.games), BPG: per(r.blk, r.games),
    TOPG: per(r.to, r.games), 'FG%': pct(r.fg, r.fga), [`${deep}%`]: pct(r.tp, r.tpa), 'FT%': pct(r.ft, r.fta),
  }));
  XLSX.utils.book_append_sheet(wb, withCols(XLSX.utils.json_to_sheet(averages), [22, 20, 5, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7]), sheet('Player Averages'));

  // ── Box Scores — every game, both teams, per-player line + team total ──
  const head = ['Player', 'MIN', 'PTS', 'OREB', 'DREB', 'REB', 'AST', 'STL', 'BLK', 'TO', 'PF', 'FG', 'FGA', 'FG%', deep, `${deep}A`, `${deep}%`, 'FT', 'FTA', 'FT%'];
  const box: (string | number)[][] = [];
  for (const m of d.matches) {
    const label = m.round ? `${m.round}` : 'Match';
    box.push([`${label}: ${m.homeTeamName} ${m.homeScore}–${m.awayScore} ${m.awayTeamName}`, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', `(${m.statsSource === 'MANUAL' ? 'manual' : 'tracked'})`]);
    for (const teamId of [m.homeTeamId, m.awayTeamId]) {
      const teamName = teamId === m.homeTeamId ? m.homeTeamName : m.awayTeamName;
      const rows = m.bb.filter((s) => teamOf(s.userId, m, d.rosters) === teamId);
      if (!rows.length) continue;
      box.push([teamName]); box.push(head);
      const tot = { min: 0, pts: 0, oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0, fg: 0, fga: 0, tp: 0, tpa: 0, ft: 0, fta: 0 };
      for (const s of rows) {
        const fg = s.twoPointers + s.threePointers;
        tot.min += s.minutesPlayed; tot.pts += s.points; tot.oreb += s.offRebounds; tot.dreb += s.defRebounds; tot.reb += s.rebounds;
        tot.ast += s.assists; tot.stl += s.steals; tot.blk += s.blocks; tot.to += s.turnovers; tot.pf += s.personalFouls;
        tot.fg += fg; tot.fga += s.fieldGoalAttempts; tot.tp += s.threePointers; tot.tpa += s.threePointAttempts; tot.ft += s.freeThrows; tot.fta += s.freeThrowAttempts;
        box.push([d.playerName.get(s.userId) ?? s.userId, r1(s.minutesPlayed), s.points, s.offRebounds, s.defRebounds, s.rebounds, s.assists, s.steals, s.blocks, s.turnovers, s.personalFouls, fg, s.fieldGoalAttempts, pct(fg, s.fieldGoalAttempts), s.threePointers, s.threePointAttempts, pct(s.threePointers, s.threePointAttempts), s.freeThrows, s.freeThrowAttempts, pct(s.freeThrows, s.freeThrowAttempts)]);
      }
      box.push(['TEAM', r1(tot.min), tot.pts, tot.oreb, tot.dreb, tot.reb, tot.ast, tot.stl, tot.blk, tot.to, tot.pf, tot.fg, tot.fga, pct(tot.fg, tot.fga), tot.tp, tot.tpa, pct(tot.tp, tot.tpa), tot.ft, tot.fta, pct(tot.ft, tot.fta)]);
    }
    box.push([]);
  }
  XLSX.utils.book_append_sheet(wb, withCols(XLSX.utils.aoa_to_sheet(box), [26, 6, 6, 6, 6, 6, 6, 6, 6, 6, 5, 5, 6, 7, 5, 6, 7, 5, 6, 7]), sheet('Box Scores'));

  // ── Per-team dashboards ──
  const teamIds = [...new Set(d.matches.flatMap((m) => [m.homeTeamId, m.awayTeamId]))];
  for (const teamId of teamIds) {
    const teamName = teamNameOf(teamId, d);
    const teamMatches = d.matches.filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId);
    let w = 0, l = 0, dr = 0, pf = 0, pa = 0;
    const results: (string | number)[][] = [['Round', 'Opponent', 'H/A', 'Score', 'Result']];
    for (const m of teamMatches) {
      const home = m.homeTeamId === teamId;
      const f = (home ? m.homeScore : m.awayScore) ?? 0;
      const a = (home ? m.awayScore : m.homeScore) ?? 0;
      pf += f; pa += a;
      const res = f > a ? 'W' : f < a ? 'L' : 'D';
      if (res === 'W') w++; else if (res === 'L') l++; else dr++;
      results.push([m.round ?? '—', home ? m.awayTeamName : m.homeTeamName, home ? 'H' : 'A', `${f}–${a}`, res]);
    }
    const squad = players.filter((p) => p.teamId === teamId).sort((a, b) => b.pts - a.pts);
    const gp = teamMatches.length;
    const sum = (k: keyof BbAgg) => squad.reduce((t, r) => t + (r[k] as number), 0);
    const best = (k: keyof BbAgg) => {
      const top = [...squad].sort((a, b) => per(b[k] as number, b.games) - per(a[k] as number, a.games))[0];
      return top ? [top.name, per(top[k] as number, top.games), r1(top[k] as number)] : ['—', 0, 0];
    };
    const aoa: (string | number)[][] = [
      [`TEAM DASHBOARD — ${teamName}`], [d.tournamentName], [],
      ['Record', `${w}-${l}${dr ? `-${dr}` : ''}`, '', 'Games', gp],
      ['Points for', pf, '', 'Points against', pa],
      ['Point difference', pf - pa, '', 'Avg margin', per(pf - pa, gp)], [],
      ['TEAM PER GAME'],
      ['PTS', per(pf, gp), 'REB', per(sum('reb'), gp), 'AST', per(sum('ast'), gp)],
      ['STL', per(sum('stl'), gp), 'BLK', per(sum('blk'), gp), 'TO', per(sum('to'), gp)],
      ['FG%', pct(sum('fg'), sum('fga')), `${deep}%`, pct(sum('tp'), sum('tpa')), 'FT%', pct(sum('ft'), sum('fta'))], [],
      ['RESULTS'], ...results, [],
      ['LEADERS', 'Player', 'Per game', 'Total'],
      ['Points', ...best('pts')], ['Rebounds', ...best('reb')], ['Assists', ...best('ast')], ['Steals', ...best('stl')], ['Blocks', ...best('blk')], [],
      ['PLAYER LINES'],
      ['Player', 'GP', 'MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'TO', 'PF', 'FG%', `${deep}%`, 'FT%', 'PPG', 'RPG', 'APG'],
      ...squad.map((r) => [r.name, r.games, r1(r.min), r.pts, r.reb, r.ast, r.stl, r.blk, r.to, r.pf, pct(r.fg, r.fga), pct(r.tp, r.tpa), pct(r.ft, r.fta), per(r.pts, r.games), per(r.reb, r.games), per(r.ast, r.games)]),
    ];
    XLSX.utils.book_append_sheet(wb, withCols(XLSX.utils.aoa_to_sheet(aoa), [22, 14, 10, 10, 8, 8, 7, 7, 7, 6, 7, 7, 7, 7, 7, 7]), sheet(teamName, ' Dash'));
  }

  return wb;
}

// ── Football aggregation + workbook ───────────────────────────────────────────
interface FbAgg {
  userId: string; name: string; teamId: string; teamName: string; games: number; min: number;
  goals: number; assists: number; shots: number; passes: number; tackles: number; saves: number; yc: number; rc: number;
}
export function aggregateFootball(d: ExportData): Map<string, FbAgg> {
  const agg = new Map<string, FbAgg>();
  for (const m of d.matches) {
    for (const s of m.fb) {
      const teamId = teamOf(s.userId, m, d.rosters);
      const t = agg.get(s.userId) ?? {
        userId: s.userId, name: d.playerName.get(s.userId) ?? s.userId, teamId, teamName: teamNameOf(teamId, d),
        games: 0, min: 0, goals: 0, assists: 0, shots: 0, passes: 0, tackles: 0, saves: 0, yc: 0, rc: 0,
      };
      t.games += 1; t.min += s.minutesPlayed; t.goals += s.goals; t.assists += s.assists; t.shots += s.shots;
      t.passes += s.passes; t.tackles += s.tackles; t.saves += s.saves; t.yc += s.yellowCards; t.rc += s.redCards;
      agg.set(s.userId, t);
    }
  }
  return agg;
}

function buildFootballWorkbook(d: ExportData): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const sheet = nameSheet();
  const players = [...aggregateFootball(d).values()];

  const leaderRows: (string | number)[][] = [['LEADERS', d.tournamentName], [], ['Category', 'Rank', 'Player', 'Team', 'Total', 'Per game', 'GP']];
  const CATS: { label: string; k: keyof FbAgg }[] = [
    { label: 'Goals', k: 'goals' }, { label: 'Assists', k: 'assists' }, { label: 'Shots', k: 'shots' },
    { label: 'Tackles', k: 'tackles' }, { label: 'Saves', k: 'saves' },
  ];
  for (const c of CATS) {
    const top = [...players].filter((p) => (p[c.k] as number) > 0).sort((a, b) => (b[c.k] as number) - (a[c.k] as number)).slice(0, 10);
    top.forEach((p, i) => leaderRows.push([i === 0 ? c.label : '', i + 1, p.name, p.teamName, p[c.k] as number, per(p[c.k] as number, p.games), p.games]));
    if (top.length) leaderRows.push([]);
  }
  XLSX.utils.book_append_sheet(wb, withCols(XLSX.utils.aoa_to_sheet(leaderRows), [12, 5, 22, 20, 8, 9, 5]), sheet('Leaders'));

  const totals = [...players].sort((a, b) => b.goals - a.goals || b.assists - a.assists).map((r) => ({
    Player: r.name, Team: r.teamName, GP: r.games, MIN: r1(r.min), G: r.goals, A: r.assists, Shots: r.shots,
    Passes: r.passes, Tackles: r.tackles, Saves: r.saves, YC: r.yc, RC: r.rc,
  }));
  XLSX.utils.book_append_sheet(wb, withCols(XLSX.utils.json_to_sheet(totals), [22, 20, 5, 7, 5, 5, 7, 8, 8, 7, 5, 5]), sheet('Player Totals'));

  const averages = [...players].sort((a, b) => per(b.goals, b.games) - per(a.goals, a.games)).map((r) => ({
    Player: r.name, Team: r.teamName, GP: r.games, 'MIN/G': per(r.min, r.games), 'G/G': per(r.goals, r.games),
    'A/G': per(r.assists, r.games), 'Shots/G': per(r.shots, r.games), 'Tackles/G': per(r.tackles, r.games), 'Saves/G': per(r.saves, r.games),
  }));
  XLSX.utils.book_append_sheet(wb, withCols(XLSX.utils.json_to_sheet(averages), [22, 20, 5, 8, 7, 7, 9, 10, 9]), sheet('Player Averages'));

  const head = ['Player', 'MIN', 'G', 'A', 'Shots', 'Passes', 'Tackles', 'Saves', 'YC', 'RC'];
  const box: (string | number)[][] = [];
  for (const m of d.matches) {
    box.push([`${m.round ?? 'Match'}: ${m.homeTeamName} ${m.homeScore}–${m.awayScore} ${m.awayTeamName}`, '', '', '', '', '', '', '', '', `(${m.statsSource === 'MANUAL' ? 'manual' : 'tracked'})`]);
    for (const teamId of [m.homeTeamId, m.awayTeamId]) {
      const teamName = teamId === m.homeTeamId ? m.homeTeamName : m.awayTeamName;
      const rows = m.fb.filter((s) => teamOf(s.userId, m, d.rosters) === teamId);
      if (!rows.length) continue;
      box.push([teamName]); box.push(head);
      for (const s of rows) box.push([d.playerName.get(s.userId) ?? s.userId, r1(s.minutesPlayed), s.goals, s.assists, s.shots, s.passes, s.tackles, s.saves, s.yellowCards, s.redCards]);
    }
    box.push([]);
  }
  XLSX.utils.book_append_sheet(wb, withCols(XLSX.utils.aoa_to_sheet(box), [26, 6, 5, 5, 7, 8, 8, 7, 5, 5]), sheet('Box Scores'));

  return wb;
}

/** Build the complete tournament workbook. Returns the xlsx bytes, a filename, and
 *  the games-played summary (so the caller can show manual games are now counted). */
/** Build the workbook from already-fetched data (pure — no DB). Exposed for tests. */
export function buildWorkbook(data: ExportData): XLSX.WorkBook {
  return data.sport === 'FOOTBALL' ? buildFootballWorkbook(data) : buildBasketballWorkbook(data);
}

export async function buildTournamentWorkbook(tournamentId: string) {
  const data = await fetchExportData(tournamentId);
  const wb = buildWorkbook(data);
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  const filename = `${data.tournamentName.replace(/[^\w]+/g, '_')}_stats.xlsx`;
  return { buffer, filename, summary: gamesPlayedSummary(data) };
}
