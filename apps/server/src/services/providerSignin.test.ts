import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideProviderOutcome } from './providerSignin';

test('existing user: Firebase UID already owns a profile → sign in', () => {
  assert.equal(
    decideProviderOutcome({ existsByUid: true, orphanExists: false, orphanFirebaseUid: null, incomingUid: 'uid-A' }),
    'existing',
  );
});

test('brand-new Google user: no UID match, no email match → onboarding (no record created)', () => {
  assert.equal(
    decideProviderOutcome({ existsByUid: false, orphanExists: false, orphanFirebaseUid: null, incomingUid: 'uid-A' }),
    'needs_onboarding',
  );
});

test('orphan with no linked UID (server-provisioned) → adopt the UID', () => {
  assert.equal(
    decideProviderOutcome({ existsByUid: false, orphanExists: true, orphanFirebaseUid: null, incomingUid: 'uid-A' }),
    'adopt_orphan',
  );
});

test('orphan already linked to THIS UID → adopt (idempotent, no conflict)', () => {
  assert.equal(
    decideProviderOutcome({ existsByUid: false, orphanExists: true, orphanFirebaseUid: 'uid-A', incomingUid: 'uid-A' }),
    'adopt_orphan',
  );
});

test('SECURITY: email owned by a DIFFERENT live UID → conflict, never silently stolen', () => {
  // A Google account must not claim an email that already belongs to another
  // Firebase account (e.g. a password user). This forces the client-side
  // linkWithCredential path, which preserves a single UID → single Prisma user.
  assert.equal(
    decideProviderOutcome({ existsByUid: false, orphanExists: true, orphanFirebaseUid: 'uid-PASSWORD', incomingUid: 'uid-GOOGLE' }),
    'conflict',
  );
});
