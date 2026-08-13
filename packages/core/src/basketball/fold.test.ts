import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foldEvents, liveClockMs, formatClock, parseClockToElapsedMs, teamScore } from './fold';
import type { TrackerEvent, EventKind, ControlPayload } from './events';

const HOME = 'team-home';
const AWAY = 'team-away';
const QUARTER_MS = 10 * 60 * 1000;
const T0 = Date.parse('2026-08-13T12:00:00.000Z');

let seq = 0;
function ev(
  kind: EventKind,
  opts: {
    playerId?: string | null; teamId?: string | null;
    x?: number; y?: number; basket?: 'LEFT' | 'RIGHT';
    quarter?: number; clockMs?: number; payload?: ControlPayload;
    atMs?: number; deleted?: boolean;
  } = {},
): TrackerEvent {
  seq += 1;
  return {
    id: `e${seq}`, matchId: 'm1', seq,
    kind,
    playerId: opts.playerId ?? null,
    teamId: opts.teamId ?? null,
    x: opts.x ?? null, y: opts.y ?? null, basket: opts.basket ?? null,
    quarter: opts.quarter ?? 1,
    clockMs: opts.clockMs ?? 0,
    payload: opts.payload ?? null,
    clientId: `c${seq}`,
    actorId: 'admin-1',
    createdAt: new Date(T0 + (opts.atMs ?? 0)).toISOString(),
    deletedAt: opts.deleted ? new Date(T0).toISOString() : null,
  };
}
const reset = () => { seq = 0; };
const opts = { homeTeamId: HOME, awayTeamId: AWAY, quarterMs: QUARTER_MS };

test('a made three scores 3 and counts toward both 3PT and total FG', () => {
  reset();
  const s = foldEvents([ev('FG3_MADE', { playerId: 'p1', teamId: HOME, x: 0.3, y: 0.5, basket: 'LEFT' })], opts);
  const line = s.players.p1;
  assert.equal(line.pts, 3);
  assert.equal(line.tp, 1);
  assert.equal(line.tpa, 1);
  assert.equal(line.fg, 1, '3pt makes are field goals too');
  assert.equal(line.fga, 1);
  assert.equal(teamScore(s.players, HOME), 3);
});

test('rebounds split into offensive/defensive and keep the total in step', () => {
  reset();
  const s = foldEvents([
    ev('OREB', { playerId: 'p1', teamId: HOME }),
    ev('DREB', { playerId: 'p1', teamId: HOME }),
    ev('DREB', { playerId: 'p1', teamId: HOME }),
  ], opts);
  assert.deepEqual(
    { oreb: s.players.p1.oreb, dreb: s.players.p1.dreb, reb: s.players.p1.reb },
    { oreb: 1, dreb: 2, reb: 3 },
  );
});

test('REGRESSION: two analysts scoring at once BOTH survive — the old blob save lost one', () => {
  // The bug this whole design exists to kill: analyst A's rebound and analyst
  // B's three, entered milliseconds apart. Under the old whole-state PATCH,
  // whichever saved second overwrote the other and the entry vanished silently.
  // Folding a log, both are simply present.
  reset();
  const s = foldEvents([
    ev('OREB', { playerId: 'pA', teamId: HOME, atMs: 100 }),      // analyst A
    ev('FG3_MADE', { playerId: 'pB', teamId: AWAY, x: 0.8, y: 0.4, basket: 'RIGHT', atMs: 200 }), // analyst B
  ], opts);
  assert.equal(s.players.pA.oreb, 1, "analyst A's rebound survived");
  assert.equal(s.players.pB.pts, 3, "analyst B's three survived");
});

test('a removed entry stops counting but stays in the log', () => {
  reset();
  const events = [
    ev('FG2_MADE', { playerId: 'p1', teamId: HOME, x: 0.1, y: 0.5, basket: 'LEFT' }),
    ev('FG2_MADE', { playerId: 'p1', teamId: HOME, x: 0.1, y: 0.5, basket: 'LEFT', deleted: true }),
  ];
  const s = foldEvents(events, opts);
  assert.equal(s.players.p1.pts, 2, 'only the live entry counts');
  assert.equal(s.players.p1.fga, 1);
  assert.equal(s.shots.length, 1, 'the removed shot leaves the chart too');
  assert.equal(events.length, 2, 'but the row is still on the log for audit');
});

test('team fouls accumulate per quarter, per side', () => {
  reset();
  const s = foldEvents([
    ev('PF', { playerId: 'p1', teamId: HOME, quarter: 1 }),
    ev('PF', { playerId: 'p2', teamId: HOME, quarter: 1 }),
    ev('PF', { playerId: 'p3', teamId: HOME, quarter: 2 }),
    ev('PF', { playerId: 'p9', teamId: AWAY, quarter: 1 }),
  ], opts);
  assert.deepEqual(s.teamFoulsHome, [2, 1]);
  assert.deepEqual(s.teamFoulsAway, [1]);
  assert.equal(s.players.p1.pf, 1);
});

test('court time is credited only while the clock runs, and only to the five on it', () => {
  reset();
  const s = foldEvents([
    ev('LINEUP_SET', { teamId: HOME, payload: { side: 'home', lineup: ['p1', 'p2'] }, atMs: 0 }),
    ev('CLOCK_START', { atMs: 0 }),
    ev('CLOCK_STOP', { atMs: 60_000 }),      // 60s of live ball
    ev('FG2_MADE', { playerId: 'p1', teamId: HOME, x: 0.1, y: 0.5, basket: 'LEFT', atMs: 90_000 }),
  ], opts);
  assert.equal(Math.round(s.players.p1.secondsPlayed), 60);
  assert.equal(Math.round(s.players.p2.secondsPlayed), 60);
  assert.equal(Math.round(s.clockMs / 1000), 60, 'the 30s with the clock stopped did not elapse');
});

test('a substitution splits court time between the player coming off and coming on', () => {
  reset();
  const s = foldEvents([
    ev('LINEUP_SET', { teamId: HOME, payload: { side: 'home', lineup: ['starter'] }, atMs: 0 }),
    ev('CLOCK_START', { atMs: 0 }),
    ev('SUB', { teamId: HOME, payload: { outIds: ['starter'], inIds: ['bench'] }, atMs: 30_000 }),
    ev('CLOCK_STOP', { atMs: 50_000 }),
  ], opts);
  assert.equal(Math.round(s.players.starter.secondsPlayed), 30);
  assert.equal(Math.round(s.players.bench.secondsPlayed), 20);
});

test('CLOCK_SET corrects the time without stopping a running clock', () => {
  reset();
  const s = foldEvents([
    ev('CLOCK_START', { atMs: 0 }),
    // Scoreboard was wrong: reset to 4:00 remaining (= 6:00 elapsed) at t+10s.
    ev('CLOCK_SET', { payload: { clockMs: 6 * 60 * 1000 }, atMs: 10_000 }),
  ], opts);
  assert.equal(s.clockMs, 6 * 60 * 1000);
  assert.equal(s.clockRunning, true, 'setting the time mid-play must not stop the game');
  // …and it keeps running from the value that was set.
  assert.equal(liveClockMs(s, T0 + 15_000, QUARTER_MS), 6 * 60 * 1000 + 5_000);
});

test('a quarter someone forgot to stop cannot credit more than a quarter of court time', () => {
  reset();
  const s = foldEvents([
    ev('LINEUP_SET', { teamId: HOME, payload: { side: 'home', lineup: ['p1'] }, atMs: 0 }),
    ev('CLOCK_START', { atMs: 0 }),
    ev('CLOCK_STOP', { atMs: 60 * 60 * 1000 }), // an hour of wall time
  ], opts);
  assert.equal(s.clockMs, QUARTER_MS);
  assert.equal(Math.round(s.players.p1.secondsPlayed), QUARTER_MS / 1000);
});

test('advancing a quarter zeroes the clock and stops it', () => {
  reset();
  const s = foldEvents([
    ev('CLOCK_START', { atMs: 0 }),
    ev('QUARTER_SET', { payload: { quarter: 2 }, atMs: 120_000 }),
  ], opts);
  assert.equal(s.quarter, 2);
  assert.equal(s.clockMs, 0);
  assert.equal(s.clockRunning, false);
});

test('shots carry their court position and their made/missed state onto the chart', () => {
  reset();
  const s = foldEvents([
    ev('FG3_MADE', { playerId: 'p1', teamId: HOME, x: 0.2, y: 0.2, basket: 'LEFT' }),
    ev('FG2_MISS', { playerId: 'p1', teamId: HOME, x: 0.08, y: 0.5, basket: 'LEFT' }),
    ev('FT_MADE', { playerId: 'p1', teamId: HOME }), // free throws have no location
  ], opts);
  assert.equal(s.shots.length, 2, 'free throws are not plotted');
  assert.deepEqual(s.shots.map((sh) => sh.made), [true, false]);
  assert.deepEqual(s.shots.map((sh) => sh.value), [3, 2]);
  assert.equal(s.shots[0].playerId, 'p1');
});

test('teams swap ends and later shots record the new basket', () => {
  reset();
  const s = foldEvents([
    ev('PERIOD_BASKETS_SWAP', { payload: { homeAttacks: 'RIGHT' } }),
  ], opts);
  assert.equal(s.homeAttacks, 'RIGHT');
});

test('clock formatting counts DOWN, and the set-clock control parses mm:ss', () => {
  assert.equal(formatClock(0, QUARTER_MS), '10:00');
  assert.equal(formatClock(6 * 60 * 1000, QUARTER_MS), '04:00');
  assert.equal(formatClock(QUARTER_MS, QUARTER_MS), '00:00');
  assert.equal(parseClockToElapsedMs('4:00', QUARTER_MS), 6 * 60 * 1000);
  assert.equal(parseClockToElapsedMs('00:30', QUARTER_MS), QUARTER_MS - 30_000);
  assert.equal(parseClockToElapsedMs('99:00', QUARTER_MS), null, 'longer than the quarter is rejected');
  assert.equal(parseClockToElapsedMs('nonsense', QUARTER_MS), null);
});

test('a stat entered for a player with no prior row creates one', () => {
  // A late roster addition tapped the instant they appear must not lose the entry.
  reset();
  const s = foldEvents([ev('STL', { playerId: 'late-add', teamId: AWAY })], opts);
  assert.equal(s.players['late-add'].stl, 1);
  assert.equal(s.players['late-add'].teamId, AWAY);
});
