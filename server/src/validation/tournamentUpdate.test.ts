import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UpdateTournamentBody } from './tournament';

// An organiser must be able to edit EVERYTHING on their tournament record (name,
// dates, venue, entry details, categories, roster limits) — not just a subset.

test('the full editable field set parses (dates, entry fee, categories, roster limits)', () => {
  const r = UpdateTournamentBody.safeParse({
    name: 'Don Bosco Silver Jubilee', description: 'Updated blurb', venue: 'Don Bosco Oratory', city: 'Panjim',
    startDate: '2026-08-04T00:00:00.000Z', endDate: '2026-08-10T00:00:00.000Z',
    prizePool: 50000, entryFee: 1500, maxTeams: 16,
    category: 'Open', ageCategory: 'U19', genderCategory: 'Men',
    minRosterSize: 5, maxRosterSize: 12,
  });
  assert.equal(r.success, true);
});

test('a tiny partial edit (just fixing a venue typo) is valid', () => {
  assert.equal(UpdateTournamentBody.safeParse({ venue: 'Corrected Venue' }).success, true);
});

test('SECURITY: sport and format are NOT editable (structural) — stripped, never applied', () => {
  const r = UpdateTournamentBody.safeParse({ name: 'X', sport: 'FOOTBALL', format: 'INDIVIDUAL' });
  assert.equal(r.success, true);
  if (r.success) {
    assert.equal('sport' in r.data, false, 'sport must be stripped');
    assert.equal('format' in r.data, false, 'format must be stripped');
  }
});

test('endDate before startDate is rejected', () => {
  const r = UpdateTournamentBody.safeParse({ startDate: '2026-08-10T00:00:00.000Z', endDate: '2026-08-04T00:00:00.000Z' });
  assert.equal(r.success, false);
});

test('minRosterSize > maxRosterSize is rejected', () => {
  assert.equal(UpdateTournamentBody.safeParse({ minRosterSize: 12, maxRosterSize: 5 }).success, false);
});
