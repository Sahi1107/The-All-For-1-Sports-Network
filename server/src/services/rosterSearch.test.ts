import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tournamentPlayerSearchWhere } from './rosterSearch';

// The scoping is the security boundary. These pin it down: the search reaches
// provisioned/minor players IN the tournament, and reaches NO ONE outside it.

test('filters by name (case-insensitive)', () => {
  const w = tournamentPlayerSearchWhere('t1', 'aarav') as any;
  assert.deepEqual(w.name, { contains: 'aarav', mode: 'insensitive' });
});

test('SECURITY: bounded to teams IN this tournament — both membership routes', () => {
  const w = tournamentPlayerSearchWhere('t1', 'x') as any;
  const teamOr = w.teamMemberships.some.team.OR;
  // A player is in scope iff they're on a team created inside the tournament OR a
  // team registered to it — nothing else can match.
  assert.deepEqual(teamOr, [
    { tournamentId: 't1' },
    { tournamentRegistrations: { some: { tournamentId: 't1' } } },
  ]);
});

test('SECURITY: does NOT apply the public discovery gate (so minors/provisioned show)…', () => {
  const w = tournamentPlayerSearchWhere('t1', 'x') as any;
  // …but also so the ABSENCE of the gate can only ever matter within the tournament scope.
  assert.equal('discoverable' in w, false);
  assert.equal('guardianManaged' in w, false);
});

test('SECURITY: the only path to a user is via a team in THIS tournament', () => {
  const w = tournamentPlayerSearchWhere('donbosco', 'x') as any;
  // The top-level filter is name + teamMemberships; there is no unscoped OR that
  // could match a user with no team in this tournament.
  assert.deepEqual(Object.keys(w).sort(), ['name', 'teamMemberships']);
  assert.equal(w.teamMemberships.some.team.OR[0].tournamentId, 'donbosco');
  assert.equal(w.teamMemberships.some.team.OR[1].tournamentRegistrations.some.tournamentId, 'donbosco');
});
