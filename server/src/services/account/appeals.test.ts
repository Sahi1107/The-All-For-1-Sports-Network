import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOpenAppeal, canSubmitAppeal, isResolution, grantEffect } from './appeals';

test('isOpenAppeal: PENDING/REVIEWING open; GRANTED/DENIED closed', () => {
  assert.equal(isOpenAppeal('PENDING'), true);
  assert.equal(isOpenAppeal('REVIEWING'), true);
  assert.equal(isOpenAppeal('GRANTED'), false);
  assert.equal(isOpenAppeal('DENIED'), false);
});

test('canSubmitAppeal: first appeal is allowed', () => {
  assert.deepEqual(canSubmitAppeal([], 'ACCOUNT_SUSPENSION', null), { ok: true });
});
test('canSubmitAppeal: blocks a duplicate OPEN appeal for the same subject', () => {
  const existing = [{ kind: 'ACCOUNT_SUSPENSION' as const, actionId: null, status: 'PENDING' as const }];
  assert.equal(canSubmitAppeal(existing, 'ACCOUNT_SUSPENSION', null).ok, false);
});
test('canSubmitAppeal: a RESOLVED prior appeal does not block a new one', () => {
  const existing = [{ kind: 'ACCOUNT_SUSPENSION' as const, actionId: null, status: 'DENIED' as const }];
  assert.equal(canSubmitAppeal(existing, 'ACCOUNT_SUSPENSION', null).ok, true);
});
test('canSubmitAppeal: different action id is a different subject → allowed', () => {
  const existing = [{ kind: 'CONTENT_REMOVAL' as const, actionId: 'a1', status: 'PENDING' as const }];
  assert.equal(canSubmitAppeal(existing, 'CONTENT_REMOVAL', 'a2').ok, true);
  assert.equal(canSubmitAppeal(existing, 'CONTENT_REMOVAL', 'a1').ok, false);
});

test('isResolution: only GRANTED/DENIED', () => {
  assert.equal(isResolution('GRANTED'), true);
  assert.equal(isResolution('DENIED'), true);
  assert.equal(isResolution('PENDING'), false);
  assert.equal(isResolution('nonsense'), false);
});

test('grantEffect: granting a suspension appeal unsuspends; content removal does not', () => {
  assert.deepEqual(grantEffect('ACCOUNT_SUSPENSION'), { unsuspend: true });
  assert.deepEqual(grantEffect('CONTENT_REMOVAL'), { unsuspend: false });
});
