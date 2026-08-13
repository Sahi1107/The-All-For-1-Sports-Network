import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldRetryWithFreshToken, shouldRedirectToLogin } from './authRetry.ts';

// The rule that stops a scorer being dumped to /login on a transient 401, while
// still redirecting on a genuinely-dead session.

test('a transient 401 is retried once with a fresh token', () => {
  assert.equal(shouldRetryWithFreshToken(401, undefined, '/tracker/matches/abc', false), true);
});

test('never retries more than once (hard cap via the per-request flag)', () => {
  assert.equal(shouldRetryWithFreshToken(401, undefined, '/tracker/matches/abc', true), false);
});

test('a revoked session is terminal — not retried', () => {
  assert.equal(shouldRetryWithFreshToken(401, 'SESSION_REVOKED', '/anything', false), false);
});

test('a token with no DB row (ACCOUNT_NOT_FOUND) is terminal — a refresh cannot fix it', () => {
  assert.equal(shouldRetryWithFreshToken(401, 'ACCOUNT_NOT_FOUND', '/tracker/matches/abc', false), false);
});

test('the pre-login /auth/sync 401 is never retried here', () => {
  assert.equal(shouldRetryWithFreshToken(401, undefined, '/auth/sync', false), false);
});

test('non-401 statuses are never retried (403 from a revoked role, 500, etc.)', () => {
  for (const s of [403, 400, 404, 409, 500, undefined]) {
    assert.equal(shouldRetryWithFreshToken(s as number, undefined, '/x', false), false, `status ${s}`);
  }
});

test('redirect to /login only on a real, unrecoverable 401 — never on 403', () => {
  assert.equal(shouldRedirectToLogin(401, '/tracker/matches/abc'), true);
  assert.equal(shouldRedirectToLogin(403, '/tracker/matches/abc'), false); // revoked role: handled in place, not a dump
  assert.equal(shouldRedirectToLogin(500, '/x'), false);
  assert.equal(shouldRedirectToLogin(401, '/auth/sync'), false);
});

test('the sequence: transient 401 → retry once → if it recurs, THEN redirect', () => {
  // first failure: retryable
  assert.equal(shouldRetryWithFreshToken(401, undefined, '/x', false), true);
  // after the retry (flag set) the same 401 is no longer retryable → redirect kicks in
  assert.equal(shouldRetryWithFreshToken(401, undefined, '/x', true), false);
  assert.equal(shouldRedirectToLogin(401, '/x'), true);
});
