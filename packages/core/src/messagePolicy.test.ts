import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canInitiateContact, canSendMessage, type ContactTarget } from './messagePolicy';

const adultAthlete: ContactTarget = { role: 'ATHLETE', discoverable: true, guardianManaged: false, age: 22, messagingFollowersOnly: false };

test('a scout CAN cold-message a discoverable adult athlete (the value proposition)', () => {
  assert.deepEqual(
    canInitiateContact({ senderRole: 'SCOUT', eitherIsAdmin: false, hasAcceptedConnection: false, target: adultAthlete }),
    { ok: true },
  );
});

test('coach/agent/media can too; a plain athlete cannot cold-message', () => {
  for (const r of ['COACH', 'AGENT', 'MEDIA']) {
    assert.equal(canInitiateContact({ senderRole: r, eitherIsAdmin: false, hasAcceptedConnection: false, target: adultAthlete }).ok, true);
  }
  assert.equal(canInitiateContact({ senderRole: 'ATHLETE', eitherIsAdmin: false, hasAcceptedConnection: false, target: adultAthlete }).ok, false);
});

test('SAFEGUARDING: guardian-managed and under-18/unknown-age are NEVER cold-reachable', () => {
  const managed = { ...adultAthlete, guardianManaged: true };
  const minor = { ...adultAthlete, age: 15 };
  const unknownAge = { ...adultAthlete, age: null };
  for (const target of [managed, minor, unknownAge]) {
    const d = canInitiateContact({ senderRole: 'SCOUT', eitherIsAdmin: false, hasAcceptedConnection: false, target });
    assert.equal(d.ok, false);
    assert.equal(d.ok === false && d.reason, 'protected_minor');
  }
});

test('the target’s own privacy choices are honoured (followers-only, not discoverable)', () => {
  assert.equal(canInitiateContact({ senderRole: 'SCOUT', eitherIsAdmin: false, hasAcceptedConnection: false, target: { ...adultAthlete, messagingFollowersOnly: true } }).ok, false);
  assert.equal(canInitiateContact({ senderRole: 'SCOUT', eitherIsAdmin: false, hasAcceptedConnection: false, target: { ...adultAthlete, discoverable: false } }).ok, false);
});

test('an accepted connection or an admin bypasses every cold-contact restriction', () => {
  const managed = { ...adultAthlete, guardianManaged: true, age: 12 };
  assert.equal(canInitiateContact({ senderRole: 'ATHLETE', eitherIsAdmin: false, hasAcceptedConnection: true, target: managed }).ok, true);
  assert.equal(canInitiateContact({ senderRole: 'ATHLETE', eitherIsAdmin: true, hasAcceptedConnection: false, target: managed }).ok, true);
});

test('RATE LIMIT: one cold message, then must wait for a reply', () => {
  const base = { eitherIsAdmin: false, hasAcceptedConnection: false, senderIsInitiator: true };
  assert.equal(canSendMessage({ ...base, targetHasReplied: false, senderMessageCount: 0 }).ok, true);  // first
  assert.equal(canSendMessage({ ...base, targetHasReplied: false, senderMessageCount: 1 }).ok, false); // second, blocked
  assert.equal(canSendMessage({ ...base, targetHasReplied: true,  senderMessageCount: 1 }).ok, true);  // they replied → open
});

test('the recipient replying is always allowed; connections/admins are unrestricted', () => {
  assert.equal(canSendMessage({ eitherIsAdmin: false, hasAcceptedConnection: false, senderIsInitiator: false, targetHasReplied: false, senderMessageCount: 0 }).ok, true);
  assert.equal(canSendMessage({ eitherIsAdmin: false, hasAcceptedConnection: true, senderIsInitiator: true, targetHasReplied: false, senderMessageCount: 5 }).ok, true);
});
