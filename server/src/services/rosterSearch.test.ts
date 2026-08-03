import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rosterPlayerSearchWhere } from './rosterSearch';

// The roster search must find ANY rosterable player by name so an organiser can
// build a roster — the two previous versions narrowed it to "already in this
// tournament OR unclaimed provisioned shell", which hid every self-registered
// player who wasn't already a participant. These pin the corrected behaviour and
// the anti-enumeration posture (name required + role-bounded; access is gated on
// the route, not by filtering results).

test('filters by name, case-insensitive', () => {
  const w = rosterPlayerSearchWhere('aarav') as any;
  assert.deepEqual(w.name, { contains: 'aarav', mode: 'insensitive' });
});

test('does NOT restrict to players already in the tournament (the core bug)', () => {
  const w = rosterPlayerSearchWhere('x') as any;
  // No membership/tournament branch — a self-registered player who isn't a
  // participant is now findable.
  assert.equal('OR' in w, false);
  assert.equal(JSON.stringify(w).includes('teamMemberships'), false);
  assert.equal(JSON.stringify(w).includes('tournamentId'), false);
});

test('does NOT filter on mustResetPassword — self-registered players are included', () => {
  const w = rosterPlayerSearchWhere('x') as any;
  assert.equal('mustResetPassword' in w, false);
});

test('SAFEGUARDING: does not apply the public discovery gate (minors + non-discoverable are findable)', () => {
  const w = rosterPlayerSearchWhere('x') as any;
  assert.equal('discoverable' in w, false);
  assert.equal('guardianManaged' in w, false);
});

test('ANTI-ENUMERATION: bounded to rosterable roles only (no admins/scouts/agents/teams)', () => {
  const w = rosterPlayerSearchWhere('x') as any;
  assert.deepEqual(w.role, { in: ['ATHLETE', 'COACH'] });
});

test('the WHERE is exactly {name, role} — nothing else leaks in', () => {
  const w = rosterPlayerSearchWhere('x') as any;
  assert.deepEqual(Object.keys(w).sort(), ['name', 'role']);
});
