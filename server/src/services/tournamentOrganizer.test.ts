import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planOrganizerAdd } from './tournamentOrganizer';

// Adding an organiser must NEVER rewrite an existing user's platform role. The plan
// encodes that structurally: `assign-existing` carries ONLY a target id, so there's
// no branch in which an existing ADMIN (or anyone) could be downgraded to ORGANIZER.
// Role is set only when a brand-new account is created (`create-new`).

test('an explicit existing userId → assign-existing (only a target id, never a role)', () => {
  const p = planOrganizerAdd({ userId: 'user-1' });
  assert.deepEqual(p, { action: 'assign-existing', targetUserId: 'user-1' });
  assert.equal('role' in p, false);
});

test('SECURITY: an existing ADMIN added by userId is only assigned — role stays untouched', () => {
  const p = planOrganizerAdd({ userId: 'the-admin' });
  assert.equal(p.action, 'assign-existing');
  // The plan literally cannot express a role change for an existing account.
  assert.deepEqual(Object.keys(p).sort(), ['action', 'targetUserId']);
});

test('an email matching an existing account → assign-existing (no new account, no role write)', () => {
  const p = planOrganizerAdd({ existingUserIdByEmail: 'u-42' });
  assert.deepEqual(p, { action: 'assign-existing', targetUserId: 'u-42' });
});

test('an unknown email → create-new (the ONLY branch that sets a role, and only on a fresh account)', () => {
  assert.deepEqual(planOrganizerAdd({ existingUserIdByEmail: null }), { action: 'create-new' });
  assert.deepEqual(planOrganizerAdd({}), { action: 'create-new' });
});

test('an explicit userId takes precedence over an email lookup', () => {
  const p = planOrganizerAdd({ userId: 'by-id', existingUserIdByEmail: 'by-email' });
  assert.deepEqual(p, { action: 'assign-existing', targetUserId: 'by-id' });
});
