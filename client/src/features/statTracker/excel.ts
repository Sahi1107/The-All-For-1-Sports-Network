import * as XLSX from 'xlsx';
import type { TrackerSession, TrackerMatch } from './types';
import { footballPlayerRows, basketballPlayerRows } from './stats';

const pctOf = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const per = (n: number, g: number) => (g ? Math.round((n / g) * 10) / 10 : 0);
const DONE = (s: string) => s === 'COMPLETED' || s === 'PUBLISHED';

function download(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename);
}

function safeSheetName(name: string) {
  return name.replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'Sheet1';
}

/**
 * Excel caps sheet names at 31 characters and rejects duplicates outright — a
 * workbook with two teams whose names share a long prefix would otherwise fail
 * to write at all. Truncates to fit the suffix and de-duplicates numerically.
 */
function sheetNamer() {
  const used = new Set<string>();
  return (name: string, suffix = '') => {
    const clean = name.replace(/[\\/?*[\]:]/g, '').trim();
    let out = (clean.slice(0, 31 - suffix.length) || 'Sheet') + suffix;
    for (let i = 2; used.has(out.toLowerCase()); i++) {
      const tag = ` ${i}`;
      out = ((clean.slice(0, 31 - suffix.length - tag.length) || 'Sheet') + suffix + tag);
    }
    used.add(out.toLowerCase());
    return out;
  };
}

/** Column widths — supported by SheetJS on write (styling/charts are not). */
function widths(ws: XLSX.WorkSheet, wch: number[]) {
  ws['!cols'] = wch.map((w) => ({ wch: w }));
  return ws;
}

const finishedMatches = (session: TrackerSession) =>
  session.matches.filter((m) => DONE(m.status) && m.state && m.homeTeamId && m.awayTeamId);

/** Box score for a single match. */
export function exportMatchExcel(match: TrackerMatch, session: TrackerSession) {
  const wb = XLSX.utils.book_new();
  const label = match.round || match.stage;

  if (session.sport === 'FOOTBALL') {
    const rows = footballPlayerRows(match, session).map((r) => ({
      Player: r.name,
      Team: r.teamName,
      MIN: r.minutes,
      G: r.goals,
      A: r.assists,
      Shots: r.shots,
      'On Target': r.shotsOnTarget,
      Saves: r.saves,
      Tackles: r.tackles,
      'Passes (C)': r.passC,
      'Pass %': pctOf(r.passC, r.passC + r.passI),
      YC: r.yellow,
      RC: r.red,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(label));
  } else {
    const rows = basketballPlayerRows(match, session).map((r) => ({
      Player: r.name,
      Team: r.teamName,
      MIN: r.min,
      PTS: r.pts,
      OREB: r.oreb,
      DREB: r.dreb,
      REB: r.reb,
      AST: r.ast,
      STL: r.stl,
      BLK: r.blk,
      TO: r.to,
      PF: r.pf,
      FG: r.fg,
      FGA: r.fga,
      'FG%': pctOf(r.fg, r.fga),
      '3P': r.tp,
      '3PA': r.tpa,
      '3P%': pctOf(r.tp, r.tpa),
      FT: r.ft,
      FTA: r.fta,
      'FT%': pctOf(r.ft, r.fta),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(label));
  }
  download(wb, `match_${label.replace(/\s+/g, '_')}_${match.id.slice(0, 6)}.xlsx`);
}

// ─── Basketball workbook ─────────────────────────────────────

interface BbAgg {
  userId: string; name: string; teamId: string; teamName: string;
  games: number; min: number; pts: number; oreb: number; dreb: number; reb: number;
  ast: number; stl: number; blk: number; to: number; pf: number;
  fg: number; fga: number; tp: number; tpa: number; ft: number; fta: number;
}

const emptyBb = (userId: string, name: string, teamId: string, teamName: string): BbAgg => ({
  userId, name, teamId, teamName, games: 0, min: 0, pts: 0, oreb: 0, dreb: 0, reb: 0,
  ast: 0, stl: 0, blk: 0, to: 0, pf: 0, fg: 0, fga: 0, tp: 0, tpa: 0, ft: 0, fta: 0,
});

/** Did this player actually feature? Every rostered player gets a zeroed row at
 *  tip-off, so counting rows as games would divide averages by squad size. */
const bbPlayed = (r: ReturnType<typeof basketballPlayerRows>[number]) =>
  r.min > 0 || r.pts + r.reb + r.ast + r.stl + r.blk + r.to + r.pf + r.fga + r.tpa + r.fta > 0;

function bbAggregate(session: TrackerSession, matches: TrackerMatch[]) {
  const agg = new Map<string, BbAgg>();
  for (const m of matches) {
    for (const r of basketballPlayerRows(m, session)) {
      if (!bbPlayed(r)) continue;
      const t = agg.get(r.userId) ?? emptyBb(r.userId, r.name, r.teamId, r.teamName);
      t.name = r.name; t.teamId = r.teamId; t.teamName = r.teamName;
      t.games += 1; t.min += r.min; t.pts += r.pts; t.oreb += r.oreb; t.dreb += r.dreb;
      t.reb += r.reb; t.ast += r.ast; t.stl += r.stl; t.blk += r.blk; t.to += r.to; t.pf += r.pf;
      t.fg += r.fg; t.fga += r.fga; t.tp += r.tp; t.tpa += r.tpa; t.ft += r.ft; t.fta += r.fta;
      agg.set(r.userId, t);
    }
  }
  return agg;
}

const bbTotalRow = (r: BbAgg) => ({
  Player: r.name, Team: r.teamName, GP: r.games, MIN: Math.round(r.min * 10) / 10,
  PTS: r.pts, OREB: r.oreb, DREB: r.dreb, REB: r.reb, AST: r.ast, STL: r.stl,
  BLK: r.blk, TO: r.to, PF: r.pf,
  FG: r.fg, FGA: r.fga, 'FG%': pctOf(r.fg, r.fga),
  '3P': r.tp, '3PA': r.tpa, '3P%': pctOf(r.tp, r.tpa),
  FT: r.ft, FTA: r.fta, 'FT%': pctOf(r.ft, r.fta),
});

const bbAvgRow = (r: BbAgg) => ({
  Player: r.name, Team: r.teamName, GP: r.games, MPG: per(r.min, r.games),
  PPG: per(r.pts, r.games), ORPG: per(r.oreb, r.games), DRPG: per(r.dreb, r.games),
  RPG: per(r.reb, r.games), APG: per(r.ast, r.games), SPG: per(r.stl, r.games),
  BPG: per(r.blk, r.games), TOPG: per(r.to, r.games), PFPG: per(r.pf, r.games),
  'FGM/G': per(r.fg, r.games), 'FGA/G': per(r.fga, r.games), 'FG%': pctOf(r.fg, r.fga),
  '3PM/G': per(r.tp, r.games), '3PA/G': per(r.tpa, r.games), '3P%': pctOf(r.tp, r.tpa),
  'FTM/G': per(r.ft, r.games), 'FTA/G': per(r.fta, r.games), 'FT%': pctOf(r.ft, r.fta),
});

const BB_TOTAL_W = [22, 20, 5, 7, 6, 6, 6, 6, 6, 6, 6, 6, 5, 5, 6, 7, 5, 6, 7, 5, 6, 7];
const BB_AVG_W = [22, 20, 5, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7];

/** Per-team sheet: every match, every player's line, with a team total per game. */
function bbTeamMatchSheet(session: TrackerSession, matches: TrackerMatch[], teamId: string) {
  const aoa: (string | number)[][] = [];
  const head = ['Player', 'MIN', 'PTS', 'OREB', 'DREB', 'REB', 'AST', 'STL', 'BLK', 'TO', 'PF',
    'FG', 'FGA', 'FG%', '3P', '3PA', '3P%', 'FT', 'FTA', 'FT%'];

  for (const m of matches) {
    if (m.homeTeamId !== teamId && m.awayTeamId !== teamId) continue;
    const rows = basketballPlayerRows(m, session).filter((r) => r.teamId === teamId);
    if (!rows.length) continue;

    const home = (session.roster ?? []).find((t) => t.teamId === m.homeTeamId)?.name ?? 'Home';
    const away = (session.roster ?? []).find((t) => t.teamId === m.awayTeamId)?.name ?? 'Away';
    const isHome = m.homeTeamId === teamId;
    const forScore = isHome ? m.homeScore : m.awayScore;
    const agScore = isHome ? m.awayScore : m.homeScore;
    const result = forScore > agScore ? 'W' : forScore < agScore ? 'L' : 'D';

    aoa.push([`${m.round || m.stage} — ${home} vs ${away}`, `${m.homeScore}–${m.awayScore}`, result]);
    aoa.push(head);

    const tot = rows.reduce((a, r) => {
      a.min += r.min; a.pts += r.pts; a.oreb += r.oreb; a.dreb += r.dreb; a.reb += r.reb;
      a.ast += r.ast; a.stl += r.stl; a.blk += r.blk; a.to += r.to; a.pf += r.pf;
      a.fg += r.fg; a.fga += r.fga; a.tp += r.tp; a.tpa += r.tpa; a.ft += r.ft; a.fta += r.fta;
      return a;
    }, { min: 0, pts: 0, oreb: 0, dreb: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0, fg: 0, fga: 0, tp: 0, tpa: 0, ft: 0, fta: 0 });

    for (const r of rows) {
      aoa.push([r.name, r.min, r.pts, r.oreb, r.dreb, r.reb, r.ast, r.stl, r.blk, r.to, r.pf,
        r.fg, r.fga, pctOf(r.fg, r.fga), r.tp, r.tpa, pctOf(r.tp, r.tpa), r.ft, r.fta, pctOf(r.ft, r.fta)]);
    }
    aoa.push(['TEAM', Math.round(tot.min * 10) / 10, tot.pts, tot.oreb, tot.dreb, tot.reb, tot.ast,
      tot.stl, tot.blk, tot.to, tot.pf, tot.fg, tot.fga, pctOf(tot.fg, tot.fga),
      tot.tp, tot.tpa, pctOf(tot.tp, tot.tpa), tot.ft, tot.fta, pctOf(tot.ft, tot.fta)]);
    aoa.push([]);
  }

  if (!aoa.length) return null;
  return widths(XLSX.utils.aoa_to_sheet(aoa), [24, 7, 6, 6, 6, 6, 6, 6, 6, 6, 5, 5, 6, 7, 5, 6, 7, 5, 6, 7]);
}

/**
 * Per-team dashboard. Data only — SheetJS's community build writes no styling or
 * charts, so this is laid out as a readable block of labelled figures rather
 * than a formatted report: record, scoring, shooting, results, leaders, and
 * every player's line for the tournament.
 */
function bbTeamDashboard(
  session: TrackerSession, matches: TrackerMatch[], teamId: string,
  teamName: string, tournamentName: string, agg: Map<string, BbAgg>,
) {
  const teamMatches = matches.filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId);
  let w = 0, l = 0, d = 0, pf = 0, pa = 0;
  const results: (string | number)[][] = [['Round', 'Opponent', 'H/A', 'Score', 'Result']];

  for (const m of teamMatches) {
    const isHome = m.homeTeamId === teamId;
    const oppId = isHome ? m.awayTeamId : m.homeTeamId;
    const oppName = (session.roster ?? []).find((t) => t.teamId === oppId)?.name ?? 'Unknown';
    const f = isHome ? m.homeScore : m.awayScore;
    const a = isHome ? m.awayScore : m.homeScore;
    pf += f; pa += a;
    const res = f > a ? 'W' : f < a ? 'L' : 'D';
    if (res === 'W') w++; else if (res === 'L') l++; else d++;
    results.push([m.round || m.stage, oppName, isHome ? 'H' : 'A', `${f}–${a}`, res]);
  }

  const squad = [...agg.values()].filter((r) => r.teamId === teamId).sort((x, y) => y.pts - x.pts);
  const gp = teamMatches.length;
  const sum = (k: keyof BbAgg) => squad.reduce((t, r) => t + (r[k] as number), 0);

  const best = (k: keyof BbAgg) => {
    const top = [...squad].sort((x, y) => per(y[k] as number, y.games) - per(x[k] as number, x.games))[0];
    return top ? [top.name, per(top[k] as number, top.games), top[k] as number] : ['—', 0, 0];
  };

  const aoa: (string | number)[][] = [
    [`TEAM DASHBOARD — ${teamName}`],
    [tournamentName],
    [],
    ['Record', `${w}-${l}${d ? `-${d}` : ''}`, '', 'Games', gp],
    ['Points for', pf, '', 'Points against', pa],
    ['Point difference', pf - pa, '', 'Avg margin', per(pf - pa, gp)],
    [],
    ['TEAM PER GAME'],
    ['PTS', per(pf, gp), 'REB', per(sum('reb'), gp), 'AST', per(sum('ast'), gp)],
    ['STL', per(sum('stl'), gp), 'BLK', per(sum('blk'), gp), 'TO', per(sum('to'), gp)],
    ['FG%', pctOf(sum('fg'), sum('fga')), '3P%', pctOf(sum('tp'), sum('tpa')), 'FT%', pctOf(sum('ft'), sum('fta'))],
    [],
    ['RESULTS'],
    ...results,
    [],
    ['LEADERS', 'Player', 'Per game', 'Total'],
    ['Points', ...best('pts')],
    ['Rebounds', ...best('reb')],
    ['Assists', ...best('ast')],
    ['Steals', ...best('stl')],
    ['Blocks', ...best('blk')],
    [],
    ['PLAYER LINES'],
    ['Player', 'GP', 'MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'TO', 'PF', 'FG%', '3P%', 'FT%', 'PPG', 'RPG', 'APG'],
    ...squad.map((r) => [
      r.name, r.games, Math.round(r.min * 10) / 10, r.pts, r.reb, r.ast, r.stl, r.blk, r.to, r.pf,
      pctOf(r.fg, r.fga), pctOf(r.tp, r.tpa), pctOf(r.ft, r.fta),
      per(r.pts, r.games), per(r.reb, r.games), per(r.ast, r.games),
    ]),
  ];

  return widths(XLSX.utils.aoa_to_sheet(aoa), [22, 14, 10, 10, 8, 8, 7, 7, 7, 6, 7, 7, 7, 7, 7, 7]);
}

// ─── Football workbook ──────────────────────────────────────

interface FbAgg {
  userId: string; name: string; teamName: string; games: number; minutes: number;
  goals: number; assists: number; shots: number; shotsOnTarget: number; saves: number;
  tackles: number; passC: number; passI: number; yellow: number; red: number;
}

function fbAggregate(session: TrackerSession, matches: TrackerMatch[]) {
  const agg = new Map<string, FbAgg>();
  for (const m of matches) {
    for (const r of footballPlayerRows(m, session)) {
      const played = r.minutes > 0
        || r.goals + r.assists + r.shots + r.saves + r.tackles + r.passC + r.passI + r.yellow + r.red > 0;
      if (!played) continue;
      const t = agg.get(r.userId) ?? {
        userId: r.userId, name: r.name, teamName: r.teamName, games: 0, minutes: 0,
        goals: 0, assists: 0, shots: 0, shotsOnTarget: 0, saves: 0, tackles: 0,
        passC: 0, passI: 0, yellow: 0, red: 0,
      };
      t.name = r.name; t.teamName = r.teamName;
      t.games += 1; t.minutes += r.minutes; t.goals += r.goals; t.assists += r.assists;
      t.shots += r.shots; t.shotsOnTarget += r.shotsOnTarget; t.saves += r.saves;
      t.tackles += r.tackles; t.passC += r.passC; t.passI += r.passI;
      t.yellow += r.yellow; t.red += r.red;
      agg.set(r.userId, t);
    }
  }
  return agg;
}

/**
 * Whole-tournament workbook: player totals, player averages, then a dashboard
 * and a per-match breakdown for every team.
 */
export function exportTournamentExcel(session: TrackerSession, tournamentName: string) {
  const wb = XLSX.utils.book_new();
  const name = sheetNamer();
  const matches = finishedMatches(session);

  if (session.sport === 'FOOTBALL') {
    const agg = fbAggregate(session, matches);
    const squad = [...agg.values()].sort((a, b) => b.goals - a.goals || b.assists - a.assists);

    XLSX.utils.book_append_sheet(wb, widths(XLSX.utils.json_to_sheet(squad.map((r) => ({
      Player: r.name, Team: r.teamName, GP: r.games, MIN: r.minutes,
      G: r.goals, A: r.assists, Shots: r.shots, 'On Target': r.shotsOnTarget,
      Saves: r.saves, Tackles: r.tackles, 'Passes (C)': r.passC,
      'Pass %': pctOf(r.passC, r.passC + r.passI), YC: r.yellow, RC: r.red,
    }))), [22, 20, 5, 7, 5, 5, 7, 10, 7, 8, 11, 8, 5, 5]), name('Player Totals'));

    XLSX.utils.book_append_sheet(wb, widths(XLSX.utils.json_to_sheet(squad.map((r) => ({
      Player: r.name, Team: r.teamName, GP: r.games, 'MIN/G': per(r.minutes, r.games),
      'G/G': per(r.goals, r.games), 'A/G': per(r.assists, r.games),
      'Shots/G': per(r.shots, r.games), 'Saves/G': per(r.saves, r.games),
      'Tackles/G': per(r.tackles, r.games), 'Pass %': pctOf(r.passC, r.passC + r.passI),
    }))), [22, 20, 5, 8, 7, 7, 9, 9, 10, 8]), name('Player Averages'));
  } else {
    const agg = bbAggregate(session, matches);
    const squad = [...agg.values()].sort((a, b) => b.pts - a.pts);

    XLSX.utils.book_append_sheet(
      wb, widths(XLSX.utils.json_to_sheet(squad.map(bbTotalRow)), BB_TOTAL_W), name('Player Totals'),
    );
    XLSX.utils.book_append_sheet(
      wb,
      widths(XLSX.utils.json_to_sheet([...squad].sort((a, b) => per(b.pts, b.games) - per(a.pts, a.games)).map(bbAvgRow)), BB_AVG_W),
      name('Player Averages'),
    );

    // Only teams that actually appear in a finished match get sheets.
    const playedTeamIds = new Set<string>();
    matches.forEach((m) => { if (m.homeTeamId) playedTeamIds.add(m.homeTeamId); if (m.awayTeamId) playedTeamIds.add(m.awayTeamId); });

    for (const team of session.roster ?? []) {
      if (!playedTeamIds.has(team.teamId)) continue;
      XLSX.utils.book_append_sheet(
        wb, bbTeamDashboard(session, matches, team.teamId, team.name, tournamentName, agg),
        name(team.name, ' Dash'),
      );
      const ws = bbTeamMatchSheet(session, matches, team.teamId);
      if (ws) XLSX.utils.book_append_sheet(wb, ws, name(team.name, ' Matches'));
    }
  }

  download(wb, `${tournamentName.replace(/\s+/g, '_')}_stats.xlsx`);
}
