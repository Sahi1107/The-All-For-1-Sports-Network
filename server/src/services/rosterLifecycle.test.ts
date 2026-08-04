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
