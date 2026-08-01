import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tournamentPlayerSearchWhere } from './rosterSearch';

// The scoping is the security boundary. These pin it down: the search reaches
// provisioned/minor players in the tournament AND unclaimed provisioned shells
// (so an organiser can add players who haven't signed in), but reaches NO real,
// self-registered private account outside the tournament.

test('filters by name (case-insensitive)', () => {
  const w = tournamentPlayerSearchWhere('t1', 'aarav') as any;
  assert.deepEqual(w.name, { contains: 'aarav', mode: 'insensitive' });
});

test('matches players already on a team IN this tournament (both membership routes)', () => {
  const w = tournamentPlayerSearchWhere('t1', 'x') as any;
  const teamBranch = w.OR.find((b: any) => b.teamMemberships);
  // In scope iff on a team created inside the tournament OR registered to it.
  assert.deepEqual(teamBranch.teamMemberships.some.team.OR, [
    { tournamentId: 't1' },
    { tournamentRegistrations: { some: { tournamentId: 't1' } } },
  ]);
});

test('ALSO matches unclaimed provisioned profiles (added but never signed in)', () => {
  const w = tournamentPlayerSearchWhere('t1', 'x') as any;
  const provisioned = w.OR.find((b: any) => 'mustResetPassword' in b);
  assert.equal(provisioned.mustResetPassword, true);       // never completed first login
  assert.deepEqual(provisioned.role, { in: ['ATHLETE', 'COACH'] }); // only roles provisioning creates
});

test('SECURITY: does NOT apply the public discovery gate (so minors/provisioned show)', () => {
  const w = tournamentPlayerSearchWhere('t1', 'x') as any;
  assert.equal('discoverable' in w, false);
  assert.equal('guardianManaged' in w, false);
});

test('SECURITY: exactly two bounded paths — this tournament, or an unclaimed shell', () => {
  const w = tournamentPlayerSearchWhere('donbosco', 'x') as any;
  assert.deepEqual(Object.keys(w).sort(), ['OR', 'name']);
  assert.equal(w.OR.length, 2);
  // Every branch is bounded — a team in THIS tournament, or a provisioned account
  // that has never logged in. No branch matches an arbitrary self-registered
  // account by name (those always have mustResetPassword=false and need a team
  // in the tournament), so real private profiles can never be enumerated.
  for (const b of w.OR) {
    const bounded = !!b.teamMemberships || b.mustResetPassword === true;
    assert.ok(bounded, 'each OR branch must be bounded');
  }
  const teamBranch = w.OR.find((b: any) => b.teamMemberships);
  assert.equal(teamBranch.teamMemberships.some.team.OR[0].tournamentId, 'donbosco');
});
