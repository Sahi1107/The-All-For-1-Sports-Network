import { test } from 'node:test';
import assert from 'node:assert/strict';
import { athleteCardEligible, stateOnly } from './eligibility';
import { idWhere } from './idToken';

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

// ─── idWhere: address a card by 12-hex slug token (keep UUIDs off public pages) ──
const UUID = '7f3a2b1c-9d4e-4f6a-8b2c-1234567890ab';
test('idWhere: 12-hex slug token → id prefix (the id never appears whole)', () => {
  // token = id's first 12 hex, hyphens stripped → "7f3a2b1c9d4e"
  assert.deepEqual(idWhere('7f3a2b1c9d4e'), { id: { startsWith: '7f3a2b1c-9d4e' } });
});
test('idWhere: token with a trailing .png is stripped', () => {
  assert.deepEqual(idWhere('7f3a2b1c9d4e.png'), { id: { startsWith: '7f3a2b1c-9d4e' } });
});
test('idWhere: full UUID still accepted (backward compat) → exact match', () => {
  assert.deepEqual(idWhere(UUID), { id: UUID });
  assert.deepEqual(idWhere(`${UUID}.png`), { id: UUID });
  assert.deepEqual(idWhere(UUID.toUpperCase()), { id: UUID }); // normalized to lower
});
test('idWhere: no LIKE wildcard can sneak into the prefix', () => {
  assert.equal(idWhere('7f3a2b1c9d4%'), null); // not 12 hex → rejected
  assert.equal(idWhere('7f3a2b1c_d4e'), null);
  assert.equal(idWhere('%%%%%%%%%%%%'), null);
});
test('idWhere: malformed / wrong-length param → null (→ fallback card)', () => {
  assert.equal(idWhere(''), null);
  assert.equal(idWhere('7f3a2b1c'), null);       // too short
  assert.equal(idWhere('7f3a2b1c9d4ee'), null);  // 13 chars
  assert.equal(idWhere('not-a-real-id'), null);
});
