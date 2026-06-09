import * as XLSX from 'xlsx';
import type { TrackerSession, TrackerMatch } from './types';
import { footballPlayerRows, basketballPlayerRows } from './stats';

const pctOf = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);

function download(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename);
}

function safeSheetName(name: string) {
  return name.replace(/[\\/?*[\]:]/g, '').slice(0, 31) || 'Sheet1';
}

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
      REB: r.reb,
      AST: r.ast,
      STL: r.stl,
      BLK: r.blk,
      TO: r.to,
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

/** Tournament-wide player totals across every published/completed match. */
export function exportTournamentExcel(session: TrackerSession, tournamentName: string) {
  const wb = XLSX.utils.book_new();
  const completed = session.matches.filter(
    (m) => m.status === 'COMPLETED' || m.status === 'PUBLISHED',
  );

  if (session.sport === 'FOOTBALL') {
    const totals = new Map<string, ReturnType<typeof footballPlayerRows>[number] & { games: number }>();
    completed.forEach((m) => {
      footballPlayerRows(m, session).forEach((r) => {
        const t = totals.get(r.userId) ?? { ...r, games: 0, goals: 0, assists: 0, shots: 0, shotsOnTarget: 0, saves: 0, tackles: 0, passC: 0, passI: 0, yellow: 0, red: 0, minutes: 0 };
        t.games += 1;
        t.goals += r.goals; t.assists += r.assists; t.shots += r.shots;
        t.shotsOnTarget += r.shotsOnTarget; t.saves += r.saves; t.tackles += r.tackles;
        t.passC += r.passC; t.passI += r.passI; t.yellow += r.yellow; t.red += r.red;
        t.minutes += r.minutes; t.name = r.name; t.teamName = r.teamName;
        totals.set(r.userId, t);
      });
    });
    const rows = [...totals.values()].sort((a, b) => b.goals - a.goals).map((r) => ({
      Player: r.name, Team: r.teamName, GP: r.games, MIN: r.minutes,
      G: r.goals, A: r.assists, Shots: r.shots, 'On Target': r.shotsOnTarget,
      Saves: r.saves, Tackles: r.tackles, YC: r.yellow, RC: r.red,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Player Totals');
  } else {
    const totals = new Map<string, { name: string; teamName: string; games: number; pts: number; reb: number; ast: number; stl: number; blk: number; to: number; fg: number; fga: number; tp: number; tpa: number; ft: number; fta: number }>();
    completed.forEach((m) => {
      basketballPlayerRows(m, session).forEach((r) => {
        const t = totals.get(r.userId) ?? { name: r.name, teamName: r.teamName, games: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, fg: 0, fga: 0, tp: 0, tpa: 0, ft: 0, fta: 0 };
        t.games += 1;
        t.pts += r.pts; t.reb += r.reb; t.ast += r.ast; t.stl += r.stl; t.blk += r.blk; t.to += r.to;
        t.fg += r.fg; t.fga += r.fga; t.tp += r.tp; t.tpa += r.tpa; t.ft += r.ft; t.fta += r.fta;
        totals.set(r.userId, t);
      });
    });
    const rows = [...totals.values()].sort((a, b) => b.pts - a.pts).map((r) => ({
      Player: r.name, Team: r.teamName, GP: r.games,
      PTS: r.pts, PPG: r.games ? Math.round((r.pts / r.games) * 10) / 10 : 0,
      REB: r.reb, AST: r.ast, STL: r.stl, BLK: r.blk, TO: r.to,
      'FG%': pctOf(r.fg, r.fga), '3P%': pctOf(r.tp, r.tpa), 'FT%': pctOf(r.ft, r.fta),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Player Totals');
  }
  download(wb, `${tournamentName.replace(/\s+/g, '_')}_player_totals.xlsx`);
}
