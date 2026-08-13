import { test } from 'node:test';
import assert from 'node:assert/strict';
import { duplicateWhere, normalizePhone } from './duplicateCheck';

test('normalizePhone reduces to the last 10 digits, ignoring formatting/country code', () => {
  assert.equal(normalizePhone('+91 98765 43210'), '9876543210');
  assert.equal(normalizePhone('098765-43210'), '9876543210');
  assert.equal(normalizePhone('123'), null);   // too short to be meaningful
  assert.equal(normalizePhone(null), null);
});

test('matches on name (case-insensitive, trimmed) OR normalised phone', () => {
  const w = duplicateWhere({ name: '  Aarav Sharma ', phone: '+91 98765 43210' }) as any;
  assert.deepEqual(w.OR, [
    { name: { equals: 'Aarav Sharma', mode: 'insensitive' } },
    { phone: { contains: '9876543210' } },
  ]);
});

test('name-only and phone-only inputs each produce a single clause', () => {
  assert.deepEqual((duplicateWhere({ name: 'Aarav' }) as any).OR, [{ name: { equals: 'Aarav', mode: 'insensitive' } }]);
  assert.deepEqual((duplicateWhere({ phone: '9876543210' }) as any).OR, [{ phone: { contains: '9876543210' } }]);
});

test('excludeEmail keeps the same-email record out of its own duplicate result', () => {
  const w = duplicateWhere({ name: 'Aarav', excludeEmail: 'A@Example.com' }) as any;
  assert.deepEqual(w.NOT, { email: 'a@example.com' });
});

test('nothing to match on → null (caller skips the query)', () => {
  assert.equal(duplicateWhere({}), null);
  assert.equal(duplicateWhere({ name: '   ', phone: '12' }), null);
});
