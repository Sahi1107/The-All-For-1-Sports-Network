import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isRosterLockedByMatches, rosterNeedsAttention, rosterMeetsMinimum,
  teamRosterIsLocked, ROSTER_LOCK_STATUSES, type RosterLockDb,
} from './rosterLifecycle';

// The cutoff is the FIRST MATCH PLAYED — not registration closing, not the draw.
// A team's roster is editable right up until it plays, then it locks (stats are
// recorded against it).

// ── The lock trigger ────────────────────────────────────────────────────────

test('roster is NOT locked while every match is still only scheduled', () => {
  assert.equal(isRosterLockedByMatches(['SCHEDULED', 'SCHEDULED']), false);
});

test('roster is NOT locked with no matches at all', () => {
  assert.equal(isRosterLockedByMatches([]), false);
});

test('roster LOCKS the moment a match goes live (IN_PROGRESS)', () => {
  assert.equal(isRosterLockedByMatches(['SCHEDULED', 'IN_PROGRESS']), true);
});

test('roster is locked once a match is COMPLETED or PUBLISHED', () => {
  assert.equal(isRosterLockedByMatches(['COMPLETED']), true);
  assert.equal(isRosterLockedByMatches(['PUBLISHED']), true);
});

test('the lock statuses are exactly the played states (not SCHEDULED)', () => {
  assert.deepEqual([...ROSTER_LOCK_STATUSES], ['IN_PROGRESS', 'COMPLETED', 'PUBLISHED']);
  assert.equal((ROSTER_LOCK_STATUSES as readonly string[]).includes('SCHEDULED'), false);
});

// ── The DB-backed gate the endpoints call ───────────────────────────────────

test('teamRosterIsLocked: true when a played match exists for the team', async () => {
  let queriedWhere: any = null;
  const db: RosterLockDb = {
    trackerMatch: { findFirst: async (args: any) => { queriedWhere = args.where; return { id: 'm1' }; } },
  };
  assert.equal(await teamRosterIsLocked('team-1', db), true);
  // It must query on the played statuses AND the team on either side.
  assert.deepEqual(queriedWhere.status, { in: ['IN_PROGRESS', 'COMPLETED', 'PUBLISHED'] });
  assert.deepEqual(queriedWhere.OR, [{ homeTeamId: 'team-1' }, { awayTeamId: 'team-1' }]);
});

test('teamRosterIsLocked: false when the team has no played match (editable)', async () => {
  const db: RosterLockDb = { trackerMatch: { findFirst: async () => null } };
  assert.equal(await teamRosterIsLocked('team-1', db), false);
});

// ── Name-only registration: rosters can be empty, flagged for attention ──────

test('an empty roster (name-only registration) needs attention', () => {
  assert.equal(rosterNeedsAttention(0, null), true);
  assert.equal(rosterNeedsAttention(0, 5), true);
});

test('a roster below the minimum needs attention', () => {
  assert.equal(rosterNeedsAttention(3, 5), true);
});

test('a roster at/above the minimum (or no minimum) does NOT need attention', () => {
  assert.equal(rosterNeedsAttention(5, 5), false);
  assert.equal(rosterNeedsAttention(8, 5), false);
  assert.equal(rosterNeedsAttention(1, null), false); // any player, no minimum ⇒ fine
});

// ── Minimum is a FIRST-MATCH concern, never a registration gate ──────────────

test('rosterMeetsMinimum: no minimum configured ⇒ always satisfied (name-only OK)', () => {
  assert.equal(rosterMeetsMinimum(0, null), true);
  assert.equal(rosterMeetsMinimum(0, undefined), true);
});

test('rosterMeetsMinimum: enforced only against a configured minimum', () => {
  assert.equal(rosterMeetsMinimum(4, 5), false);
  assert.equal(rosterMeetsMinimum(5, 5), true);
});

// ─── Roster snapshot reconciliation ──────────────────────────────────────────
// A player added to a team after the draw was invisible to the scorer, because
// the tracker reads a snapshot frozen at draw time. The fix reconciles on match
// load — but it MUST be additive, which is what these pin.

import { mergeRoster, rosterSignature, type RosterSnapshotTeam } from './rosterLifecycle';

const p = (userId: string, number: number | null = null) =>
  ({ userId, name: userId, position: null, number });
const team = (teamId: string, players: ReturnType<typeof p>[]): RosterSnapshotTeam =>
  ({ teamId, name: teamId, players });

test('a player added after the draw appears in the reconciled roster', () => {
  const prev = [team('A', [p('one'), p('two')])];
  const fresh = [team('A', [p('one'), p('two'), p('late')])];
  const merged = mergeRoster(prev, fresh);
  assert.deepEqual(merged[0].players.map((x) => x.userId), ['one', 'two', 'late']);
});

test('a player who left the squad is KEPT — their recorded stats would otherwise be stranded', () => {
  const prev = [team('A', [p('one'), p('departed')])];
  const fresh = [team('A', [p('one')])]; // no longer an accepted member
  const merged = mergeRoster(prev, fresh);
  assert.deepEqual(merged[0].players.map((x) => x.userId).sort(), ['departed', 'one']);
});

test('jersey numbers already entered survive the merge', () => {
  const prev = [team('A', [p('one', 23)])];
  // buildRosterSnapshot carries numbers, so fresh already has it; the merge must not clobber.
  const fresh = [team('A', [p('one', 23), p('late', null)])];
  const merged = mergeRoster(prev, fresh);
  assert.equal(merged[0].players.find((x) => x.userId === 'one')!.number, 23);
});

test('a whole team dropped from registrations keeps its snapshot entry', () => {
  const prev = [team('A', [p('one')]), team('B', [p('two')])];
  const fresh = [team('A', [p('one')])];
  const merged = mergeRoster(prev, fresh);
  assert.deepEqual(merged.map((t) => t.teamId).sort(), ['A', 'B']);
});

test('a brand-new team is added wholesale', () => {
  const merged = mergeRoster([team('A', [p('one')])], [team('A', [p('one')]), team('C', [p('three')])]);
  assert.deepEqual(merged.map((t) => t.teamId).sort(), ['A', 'C']);
});

test('signature ignores ordering, so an unchanged roster is not rewritten', () => {
  const a = [team('A', [p('one'), p('two')]), team('B', [p('three')])];
  const b = [team('B', [p('three')]), team('A', [p('two'), p('one')])];
  assert.equal(rosterSignature(a), rosterSignature(b));
});

test('signature changes when a player joins — that is what triggers the write', () => {
  const before = [team('A', [p('one')])];
  const after = [team('A', [p('one'), p('late')])];
  assert.notEqual(rosterSignature(before), rosterSignature(after));
});

test('merging an unchanged roster is a no-op by signature', () => {
  const prev = [team('A', [p('one'), p('two')])];
  assert.equal(rosterSignature(mergeRoster(prev, prev)), rosterSignature(prev));
});
