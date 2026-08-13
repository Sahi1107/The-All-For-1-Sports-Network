import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcileEmail, validateNewEmail } from './emailChange';

// ─── reconcileEmail ──────────────────────────────────────────────────────────
test('reconcile: verified token email that differs → update to it', () => {
  assert.deepEqual(
    reconcileEmail({ tokenEmail: 'new@x.com', emailVerified: true, dbEmail: 'old@x.com' }),
    { update: true, email: 'new@x.com' },
  );
});
test('reconcile: case/whitespace-insensitive match → no update', () => {
  assert.deepEqual(reconcileEmail({ tokenEmail: ' Old@X.com ', emailVerified: true, dbEmail: 'old@x.com' }), { update: false });
});
test('reconcile: normalizes the adopted email to lowercase/trimmed', () => {
  assert.deepEqual(reconcileEmail({ tokenEmail: '  NEW@X.com ', emailVerified: true, dbEmail: 'old@x.com' }), { update: true, email: 'new@x.com' });
});
test('SAFETY: an UNVERIFIED token email is never adopted', () => {
  assert.deepEqual(reconcileEmail({ tokenEmail: 'new@x.com', emailVerified: false, dbEmail: 'old@x.com' }), { update: false });
});
test('reconcile: empty / missing token email → no update', () => {
  assert.deepEqual(reconcileEmail({ tokenEmail: '', emailVerified: true, dbEmail: 'old@x.com' }), { update: false });
  assert.deepEqual(reconcileEmail({ tokenEmail: null, emailVerified: true, dbEmail: 'old@x.com' }), { update: false });
});

// ─── validateNewEmail ────────────────────────────────────────────────────────
test('validateNewEmail: accepts a well-formed, different address', () => {
  assert.deepEqual(validateNewEmail('New@Example.com', 'old@x.com'), { ok: true, email: 'new@example.com' });
});
test('validateNewEmail: rejects the current email (case-insensitive)', () => {
  const r = validateNewEmail('OLD@x.com', 'old@x.com');
  assert.equal(r.ok, false);
});
test('validateNewEmail: rejects malformed addresses', () => {
  for (const bad of ['', 'nope', 'a@b', 'a @b.com', 'a@b .com']) {
    assert.equal(validateNewEmail(bad, 'old@x.com').ok, false, bad);
  }
});
