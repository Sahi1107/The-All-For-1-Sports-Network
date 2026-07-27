import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSessionRevoked } from './sessions';

const REVOKED_AT = new Date('2026-07-27T12:00:00.000Z');
const at = (iso: string) => Math.floor(new Date(iso).getTime() / 1000); // → auth_time seconds

test('token authenticated BEFORE revocation → revoked', () => {
  assert.equal(isSessionRevoked(at('2026-07-27T11:59:59Z'), REVOKED_AT), true);
});
test('token authenticated in the SAME second as revocation → revoked (<=)', () => {
  assert.equal(isSessionRevoked(at('2026-07-27T12:00:00Z'), REVOKED_AT), true);
});
test('token authenticated AFTER revocation (re-login) → allowed', () => {
  assert.equal(isSessionRevoked(at('2026-07-27T12:00:05Z'), REVOKED_AT), false);
});
test('no revocation on record → never revoked', () => {
  assert.equal(isSessionRevoked(at('2020-01-01T00:00:00Z'), null), false);
  assert.equal(isSessionRevoked(at('2020-01-01T00:00:00Z'), undefined), false);
});
test('SAFETY: unusable auth_time fails open (never locks the user out)', () => {
  assert.equal(isSessionRevoked(undefined, REVOKED_AT), false);
  assert.equal(isSessionRevoked(NaN, REVOKED_AT), false);
  assert.equal(isSessionRevoked(null, REVOKED_AT), false);
});
