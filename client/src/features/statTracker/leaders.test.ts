import { test } from 'node:test';
import assert from 'node:assert/strict';
import { minGamesToQualify, tournamentLeaders, QUALIFY_SHARE } from './leaders.ts';
import type { TrackerSession, TrackerMatch, BasketballPlayer } from './types.ts';

test('qualifying bar is half the team\'s games, rounded up, never below 1', () => {
  assert.equal(QUALIFY_SHARE, 0.5);
  assert.equal(minGamesToQualify(0), 1);
  assert.equal(minGamesToQualify(1), 1);
  assert.equal(minGamesToQualify(2), 1);
  assert.equal(minGamesToQualify(3), 2);
  assert.equal(minGamesToQualify(4), 2);
  assert.equal(minGamesToQualify(5), 3);
  assert.equal(minGamesToQualify(8), 4);
});

const bb = (teamId: string, pts: number, min = 20): BasketballPlayer => ({
  teamId, secondsPlayed: min * 60, pts, ast: 0, reb: 0, oreb: 0, dreb: 0, stl: 0, blk: 0,
  fg: 0, fga: 0, tp: 0, tpa: 0, ft: 0, fta: 0, to: 0, pf: 0,
});

function session(matches: TrackerMatch[], teams: { teamId: string; name: string; players: string[] }[]): TrackerSession {
  return {
    id: 's', tournamentId: 't', sport: 'BASKETBALL', format: 'LEAGUE', groups: null,
    bracket: null, config: null, matches,
    roster: teams.map((t) => ({
      teamId: t.teamId, name: t.name,
      players: t.players.map((id) => ({ userId: id, name: id, position: null, number: null })),
    })),
  };
}

function match(id: string, home: string, away: string, players: Record<string, BasketballPlayer>): TrackerMatch {
  return {
    id, sessionId: 's', stage: 'group', round: id, groupId: null, bracketSlot: null,
    feedsInto: null, orderIndex: 0, homeTeamId: home, awayTeamId: away,
    homeScore: 0, awayScore: 0, status: 'PUBLISHED', publishedMatchId: null,
    state: {
      quarter: 1, quarterSeconds: 720, clockSeconds: 0, clockRunning: false,
      onCourtHome: [], onCourtAway: [], players, teamFoulsHome: [], teamFoulsAway: [], log: [],
    },
  } as TrackerMatch;
}

test('a one-game cameo cannot top an averaged board over a full-tournament player', () => {
  // Team A plays 4 games. `regular` plays all 4 at 10 pts; `cameo` plays once for 40.
  const matches = [0, 1, 2, 3].map((i) =>
    match(`g${i}`, 'A', 'B', {
      regular: bb('A', 10),
      // cameo only features in the last game
      ...(i === 3 ? { cameo: bb('A', 40) } : { cameo: { ...bb('A', 0), secondsPlayed: 0 } }),
      opp: bb('B', 5),
    }),
  );
  const s = session(matches, [
    { teamId: 'A', name: 'Team A', players: ['regular', 'cameo'] },
    { teamId: 'B', name: 'Team B', players: ['opp'] },
  ]);

  const pts = tournamentLeaders(s).find((c) => c.key === 'pts')!;
  assert.equal(pts.perGame, true, 'multi-game tournament should average');
  assert.equal(pts.minGames, 2, '4 team games → 2 to qualify');
  const names = pts.rows.map((r) => r.userId);
  assert.ok(!names.includes('cameo'), 'a 1-of-4 appearance must not qualify');
  assert.equal(pts.rows[0].userId, 'regular');
  assert.equal(pts.rows[0].value, 10);
});

test('a team eliminated after one game still qualifies (bar is team-relative)', () => {
  // Team A goes deep (4 games); team B is knocked out after one.
  const deep = [0, 1, 2].map((i) => match(`g${i}`, 'A', 'C', { star: bb('A', 10), c: bb('C', 1) }));
  const opener = match('g3', 'A', 'B', { star: bb('A', 10), earlyExit: bb('B', 30) });
  const s = session([...deep, opener], [
    { teamId: 'A', name: 'Team A', players: ['star'] },
    { teamId: 'B', name: 'Team B', players: ['earlyExit'] },
    { teamId: 'C', name: 'Team C', players: ['c'] },
  ]);

  const pts = tournamentLeaders(s).find((c) => c.key === 'pts')!;
  const row = pts.rows.find((r) => r.userId === 'earlyExit');
  assert.ok(row, 'a player who played every one of their team\'s games must qualify');
  assert.equal(row!.games, 1);
  assert.equal(row!.value, 30, 'their single game is their average');
});

test('single-game tournaments stay on totals and apply no qualifier', () => {
  const s = session([match('final', 'A', 'B', { a: bb('A', 20), b: bb('B', 14) })], [
    { teamId: 'A', name: 'Team A', players: ['a'] },
    { teamId: 'B', name: 'Team B', players: ['b'] },
  ]);
  const pts = tournamentLeaders(s).find((c) => c.key === 'pts')!;
  assert.equal(pts.perGame, false);
  assert.equal(pts.minGames, undefined);
  assert.equal(pts.rows.length, 2);
  assert.equal(pts.rows[0].value, 20);
});

test('never-played bench players are excluded from games played', () => {
  const matches = [0, 1].map((i) =>
    match(`g${i}`, 'A', 'B', {
      starter: bb('A', 12),
      benched: { ...bb('A', 0), secondsPlayed: 0 },
      opp: bb('B', 4),
    }),
  );
  const s = session(matches, [
    { teamId: 'A', name: 'Team A', players: ['starter', 'benched'] },
    { teamId: 'B', name: 'Team B', players: ['opp'] },
  ]);
  const pts = tournamentLeaders(s).find((c) => c.key === 'pts')!;
  // 12 per game, not 12 total over 2 "appearances" mis-divided by squad size.
  assert.equal(pts.rows[0].value, 12);
  assert.equal(pts.rows[0].games, 2);
  assert.ok(!pts.rows.some((r) => r.userId === 'benched'));
});
