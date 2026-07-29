import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideAuth, type AuthAccount, type AuthClaims } from './auth';

// The core auth decision. The property that matters: role is read from the DB
// account, NEVER the token — so a role change takes effect on the very next
// request with no re-login, and there is no way for a stale token to grant or
// withhold access. It also fails CLOSED when there's no matching account.

const claims: AuthClaims = { userId: 'u1', email: 'a@b.com', email_verified: true, auth_time: 2000 };
const account = (over: Partial<AuthAccount> = {}): AuthAccount => ({
  id: 'u1', role: 'ATHLETE', sessionsRevokedAt: null, suspended: false, suspensionReason: null, suspendedAt: null, ...over,
});

test('role comes from the DB account, not the token (same token, different DB role)', () => {
  // The token/claims object has NO role field at all — the type forbids it.
  const asAthlete = decideAuth(claims, account({ role: 'ATHLETE' }), false);
  const asAdmin = decideAuth(claims, account({ role: 'ADMIN' }), false);
  assert.equal(asAthlete.ok && asAthlete.user.role, 'ATHLETE');
  assert.equal(asAdmin.ok && asAdmin.user.role, 'ADMIN');
});

test('a promotion is live: flipping the DB row to ADMIN flips the decision, no re-login', () => {
  // Same claims (Sahil's unchanged token) — only the DB row changed.
  const before = decideAuth(claims, account({ role: 'ATHLETE' }), false);
  const after = decideAuth(claims, account({ role: 'ADMIN' }), false);
  assert.equal(before.ok && before.user.role, 'ATHLETE');
  assert.equal(after.ok && after.user.role, 'ADMIN'); // takes effect immediately
});

test('a demotion is live too: a stale ADMIN token cannot keep access', () => {
  // Even if the old token was minted while ADMIN, the DB now says COACH.
  const d = decideAuth(claims, account({ role: 'COACH' }), false);
  assert.equal(d.ok && d.user.role, 'COACH');
});

test('SECURITY: a valid token with NO matching DB row fails closed (401, no default role)', () => {
  const d = decideAuth(claims, null, false);
  assert.equal(d.ok, false);
  assert.equal(d.ok === false && d.status, 401);
  // Distinct, terminal code — not confused with the other 401s, and the client
  // won't waste a token-refresh retry on it (a fresh token can't create a row).
  assert.equal(d.ok === false && d.code, 'ACCOUNT_NOT_FOUND');
  // There is no `user` and therefore no role — access is denied, not defaulted.
  assert.equal('user' in d, false);
});

test('missing userId claim → 401 CLAIMS_MISSING (nothing to look up)', () => {
  const d = decideAuth({ ...claims, userId: undefined }, account(), false);
  assert.equal(d.ok === false && d.status, 401);
  assert.equal(d.ok === false && d.code, 'CLAIMS_MISSING');
});

test('suspended → 403 ACCOUNT_SUSPENDED with reason; allowSuspended lets them through', () => {
  const denied = decideAuth(claims, account({ suspended: true, suspensionReason: 'spam' }), false);
  assert.equal(denied.ok === false && denied.status, 403);
  assert.equal(denied.ok === false && denied.code, 'ACCOUNT_SUSPENDED');
  assert.equal(denied.ok === false && denied.reason, 'spam');
  const allowed = decideAuth(claims, account({ suspended: true }), true); // appeal routes
  assert.equal(allowed.ok, true);
  assert.equal(allowed.ok && allowed.user.suspended, true);
});

test('a revoked session (auth_time predates sessionsRevokedAt) → 401 SESSION_REVOKED', () => {
  // sessionsRevokedAt is after the token's auth_time (2000s) → revoked.
  const d = decideAuth(claims, account({ sessionsRevokedAt: new Date(3000 * 1000) }), false);
  assert.equal(d.ok === false && d.code, 'SESSION_REVOKED');
});

test('happy path: identity from token, role/suspension from DB', () => {
  const d = decideAuth(claims, account({ role: 'ADMIN' }), false);
  assert.equal(d.ok, true);
  if (d.ok) {
    assert.equal(d.user.userId, 'u1');
    assert.equal(d.user.email, 'a@b.com');
    assert.equal(d.user.role, 'ADMIN');
    assert.equal(d.user.emailVerified, true);
  }
});
