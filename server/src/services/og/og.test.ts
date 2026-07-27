import { test } from 'node:test';
import assert from 'node:assert/strict';
import { athleteCardEligible, stateOnly } from './eligibility';

const adult = { role: 'ATHLETE', discoverable: true, guardianManaged: false, age: 20 };

test('eligible: a discoverable adult athlete gets a card', () => {
  assert.equal(athleteCardEligible(adult), true);
});
test('INELIGIBLE: guardian-managed (under-13) never generates a card', () => {
  assert.equal(athleteCardEligible({ ...adult, guardianManaged: true, age: 12 }), false);
});
test('INELIGIBLE: private (undiscoverable) never generates a card', () => {
  assert.equal(athleteCardEligible({ ...adult, discoverable: false }), false);
});
test('INELIGIBLE: age < 13 never generates a card', () => {
  assert.equal(athleteCardEligible({ ...adult, age: 12 }), false);
});
test('INELIGIBLE: a non-athlete (coach/scout) never generates an athlete card', () => {
  assert.equal(athleteCardEligible({ ...adult, role: 'COACH' }), false);
});
test('INELIGIBLE: null / unknown profile → no card', () => {
  assert.equal(athleteCardEligible(null), false);
  assert.equal(athleteCardEligible(undefined), false);
});
test('age unknown but discoverable + not-managed → eligible (13+ by construction)', () => {
  assert.equal(athleteCardEligible({ ...adult, age: null }), true);
});

test('stateOnly never leaks the city (state or region only)', () => {
  assert.equal(stateOnly('Mumbai, Maharashtra, India'), 'Maharashtra');
  assert.equal(stateOnly('Maharashtra, India'), 'Maharashtra');
  assert.equal(stateOnly('India'), 'India');
  assert.equal(stateOnly(null), null);
});
