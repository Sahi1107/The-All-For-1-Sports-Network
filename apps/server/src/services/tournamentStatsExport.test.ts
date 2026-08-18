import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { aggregateBasketball, gamesPlayedSummary, buildWorkbook, type ExportData } from './tournamentStatsExport';

// The bug: the old export read the tracker `state`, so manually-entered games (no
// state) were invisible — a player's games-played and stats omitted them. The fix
// reads the persisted stat tables, where BOTH sources land, so a manual game counts
// exactly like a tracked one. These assert that on a fixture with both.

const bb = (userId: string, pts: number, reb = 0) => ({
  userId, points: pts, rebounds: reb, offRebounds: 0, defRebounds: reb, assists: 0, steals: 0, blocks: 0,
  twoPointers: 0, threePointers: 0, freeThrows: 0, fieldGoalAttempts: 0, threePointAttempts: 0,
  freeThrowAttempts: 0, turnovers: 0, personalFouls: 0, minutesPlayed: 20,
});

// P1 (Team A) plays all three games; P3 (Team B) plays two. Game 3 is MANUAL — the
// one the old export dropped.
const fixture = (): ExportData => ({
  tournamentName: 'Test Cup', sport: 'BASKETBALL', variant: 'FIVE_V_FIVE',
  matches: [
    { id: 'm1', round: 'R1', matchDate: new Date('2026-01-01'), statsSource: 'TRACKER', homeTeamId: 'A', awayTeamId: 'B', homeTeamName: 'Team A', awayTeamName: 'Team B', homeScore: 40, awayScore: 30, bb: [bb('p1', 20, 5), bb('p3', 15)], fb: [] },
    { id: 'm2', round: 'R2', matchDate: new Date('2026-01-02'), statsSource: 'TRACKER', homeTeamId: 'A', awayTeamId: 'B', homeTeamName: 'Team A', awayTeamName: 'Team B', homeScore: 33, awayScore: 33, bb: [bb('p1', 18, 7), bb('p3', 22)], fb: [] },
    { id: 'm3', round: 'R3', matchDate: new Date('2026-01-03'), statsSource: 'MANUAL', homeTeamId: 'A', awayTeamId: 'B', homeTeamName: 'Team A', awayTeamName: 'Team B', homeScore: 50, awayScore: 45, bb: [bb('p1', 25, 4), bb('p3', 30)], fb: [] },
  ],
  rosters: new Map([['A', new Set(['p1', 'p2'])], ['B', new Set(['p3'])]]),
  playerName: new Map([['p1', 'Alice'], ['p3', 'Bob']]),
});

test('the manual game is counted — games-played goes up, not ignored', () => {
  const d = fixture();

  // BEFORE (old behaviour: tracker games only)
  const before = { ...d, matches: d.matches.filter((m) => m.statsSource === 'TRACKER') };
  const p1Before = aggregateBasketball(before).get('p1')!;
  assert.equal(p1Before.games, 2, 'old export saw only the 2 tracked games');

  // AFTER (the fix: all published games)
  const p1After = aggregateBasketball(d).get('p1')!;
  assert.equal(p1After.games, 3, 'the manual game is now included');
  assert.equal(p1After.pts, 20 + 18 + 25, 'the manual game’s points are counted');
  assert.equal(p1After.reb, 5 + 7 + 4);
});

test('games-played summary reports the source split', () => {
  const s = gamesPlayedSummary(fixture());
  assert.equal(s.totalGames, 3);
  assert.equal(s.trackerGames, 2);
  assert.equal(s.manualGames, 1); // exactly what the old export dropped
});

test('players are placed on their team via the roster', () => {
  const agg = aggregateBasketball(fixture());
  assert.equal(agg.get('p1')!.teamId, 'A');
  assert.equal(agg.get('p1')!.teamName, 'Team A');
  assert.equal(agg.get('p3')!.teamId, 'B');
});

test('a player on neither roster still appears (falls back to home, not dropped)', () => {
  const d = fixture();
  d.matches[0].bb.push(bb('ghost', 8));
  const agg = aggregateBasketball(d);
  assert.ok(agg.has('ghost'), 'unrostered player is not silently dropped');
  assert.equal(agg.get('ghost')!.games, 1);
});

test('the workbook builds with the expected tabs and includes the manual game', () => {
  const wb = buildWorkbook(fixture());
  for (const s of ['Leaders', 'Player Totals', 'Player Averages', 'Box Scores', 'Team A Dash', 'Team B Dash']) {
    assert.ok(wb.SheetNames.includes(s), `missing sheet: ${s}`);
  }
  // The manual game (round R3) must appear in the Box Scores sheet.
  const box = XLSX.utils.sheet_to_csv(wb.Sheets['Box Scores']);
  assert.match(box, /R3/, 'the manual game (R3) is in the box scores');
  assert.match(box, /manual/, 'and it is labelled as manually entered');
  // Player Totals sums the manual game — Alice = 20+18+25 = 63 points.
  const totals = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Player Totals']);
  const alice = totals.find((r) => r.Player === 'Alice');
  assert.equal(alice?.PTS, 63);
  assert.equal(alice?.GP, 3);
});
