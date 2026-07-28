import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideTournamentAccess } from './tournamentAccess';

// These tests pin down EVERY tournament-scoping boundary from the spec. The
// middleware's only side inputs are `tournamentId` (resolved from the request)
// and `isAssignedOrganizer` (looked up live per request); the rest of the
// decision is this pure function, so exhausting it exhausts the access rules.

const T_A = 'tournament-A';

// ─── Platform ADMIN — unscoped, always allowed ────────────────────────────────
test('ADMIN is allowed on any tournament (unscoped), assigned or not', () => {
  assert.deepEqual(
    decideTournamentAccess({ authenticated: true, role: 'ADMIN', tournamentId: T_A, isAssignedOrganizer: false }),
    { ok: true },
  );
});

// ─── Assigned organiser — allowed on THEIR tournament ─────────────────────────
test('assigned organiser is allowed on their own tournament', () => {
  assert.deepEqual(
    decideTournamentAccess({ authenticated: true, role: 'ORGANIZER', tournamentId: T_A, isAssignedOrganizer: true }),
    { ok: true },
  );
});

// ─── Organiser hitting ANOTHER tournament — denied 403 ────────────────────────
// The resolver produces the *target* tournament's id; not being assigned to it
// (isAssignedOrganizer=false) is exactly the cross-tournament attack, and it's denied.
test('SECURITY: organiser hitting a tournament they are NOT assigned to → 403', () => {
  assert.deepEqual(
    decideTournamentAccess({ authenticated: true, role: 'ORGANIZER', tournamentId: 'tournament-B', isAssignedOrganizer: false }),
    { ok: false, status: 403, error: 'You do not have organiser access to this tournament.' },
  );
});

// ─── Revoked organiser — denied immediately ───────────────────────────────────
// Revocation deletes the assignment row; the live lookup then yields false, so the
// very next request is denied. Same shape as the not-assigned case — that's the point.
test('SECURITY: a revoked organiser (no live assignment) is denied immediately → 403', () => {
  assert.deepEqual(
    decideTournamentAccess({ authenticated: true, role: 'ORGANIZER', tournamentId: T_A, isAssignedOrganizer: false }),
    { ok: false, status: 403, error: 'You do not have organiser access to this tournament.' },
  );
});

// ─── The ORGANIZER label alone grants nothing ─────────────────────────────────
// An ORGANIZER for tournament A must not gain access to B just by holding the role.
test('SECURITY: ORGANIZER role is an identity label — grants nothing without an assignment', () => {
  const noAccess = decideTournamentAccess({ authenticated: true, role: 'ORGANIZER', tournamentId: T_A, isAssignedOrganizer: false });
  assert.equal(noAccess.ok, false);
});

// ─── Ordinary users / other roles — denied ────────────────────────────────────
for (const role of ['ATHLETE', 'COACH', 'SCOUT', undefined] as const) {
  test(`SECURITY: role ${role ?? 'undefined'} without an assignment is denied → 403`, () => {
    assert.deepEqual(
      decideTournamentAccess({ authenticated: true, role, tournamentId: T_A, isAssignedOrganizer: false }),
      { ok: false, status: 403, error: 'You do not have organiser access to this tournament.' },
    );
  });
}

// ─── Unauthenticated — 401 before anything else ───────────────────────────────
test('unauthenticated request → 401 (checked before tournament resolution)', () => {
  assert.deepEqual(
    decideTournamentAccess({ authenticated: false, role: undefined, tournamentId: null, isAssignedOrganizer: false }),
    { ok: false, status: 401, error: 'Not authenticated' },
  );
});

// ─── Unknown / unresolved tournament — 404, no existence leak ──────────────────
test('authenticated but tournament unresolved → 404 (does not leak existence)', () => {
  assert.deepEqual(
    decideTournamentAccess({ authenticated: true, role: 'ORGANIZER', tournamentId: null, isAssignedOrganizer: false }),
    { ok: false, status: 404, error: 'Tournament not found' },
  );
});

// Even an ADMIN gets 404 for an unknown tournament (no special existence oracle).
test('ADMIN on an unresolved tournament → 404', () => {
  assert.deepEqual(
    decideTournamentAccess({ authenticated: true, role: 'ADMIN', tournamentId: null, isAssignedOrganizer: false }),
    { ok: false, status: 404, error: 'Tournament not found' },
  );
});
