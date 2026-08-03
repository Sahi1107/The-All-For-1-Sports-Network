import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canManageDraw, isRegistrationOpen, unassignedTeamIds } from './manageGate.ts';

// The invariant under test: registration status limits the PUBLIC (self-register),
// never the organiser setting up their own tournament. This is the second time a
// status gate wrongly restricted management (roster editing was first), so these
// pin the rule so it can't regress a third time.

const ALL_STATUSES = ['UPCOMING', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

test('draw generation is available while registration is still OPEN', () => {
  assert.equal(canManageDraw('REGISTRATION_OPEN'), true);
  assert.equal(canManageDraw('UPCOMING'), true);
});

test('status-independence invariant: management is allowed in EVERY non-cancelled state', () => {
  for (const s of ALL_STATUSES) {
    assert.equal(canManageDraw(s), s !== 'CANCELLED', `canManageDraw(${s})`);
  }
});

test('cancelled / missing status is the only thing that blocks management', () => {
  assert.equal(canManageDraw('CANCELLED'), false);
  assert.equal(canManageDraw(null), false);
  assert.equal(canManageDraw(undefined), false);
  assert.equal(canManageDraw(''), false);
});

test('registration is "open" only before it closes', () => {
  assert.equal(isRegistrationOpen('UPCOMING'), true);
  assert.equal(isRegistrationOpen('REGISTRATION_OPEN'), true);
  assert.equal(isRegistrationOpen('REGISTRATION_CLOSED'), false);
  assert.equal(isRegistrationOpen('IN_PROGRESS'), false);
  assert.equal(isRegistrationOpen('CANCELLED'), false);
});

// Late entries — teams registered AFTER a draw exists. Must be detectable so
// they're never silently stranded.

test('late entries: registered teams not in any group are surfaced', () => {
  const registered = ['a', 'b', 'c', 'd'];
  const groups = [{ teamIds: ['a', 'b'] }, { teamIds: ['c'] }];
  assert.deepEqual(unassignedTeamIds(registered, groups), ['d']);
});

test('late entries: a fully-placed draw reports none', () => {
  assert.deepEqual(unassignedTeamIds(['a', 'b'], [{ teamIds: ['a', 'b'] }]), []);
});

test('late entries: no groups yet ⇒ every registered team is unplaced', () => {
  assert.deepEqual(unassignedTeamIds(['a', 'b'], null), ['a', 'b']);
  assert.deepEqual(unassignedTeamIds(['a', 'b'], []), ['a', 'b']);
});
