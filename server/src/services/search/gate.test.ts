import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSearchablePerson, searchablePeopleWhere, NON_PERSON_ROLES } from './gate';

const base = { id: 'u1', role: 'ATHLETE', discoverable: true, guardianManaged: false };
const noExclusions: ReadonlySet<string> = new Set();

// ─── isSearchablePerson: the belt-and-suspenders re-check ─────────────────────
test('eligible: a discoverable adult athlete is searchable', () => {
  assert.equal(isSearchablePerson(base, noExclusions), true);
});
test('eligible: coach / scout / agent / media are searchable', () => {
  for (const role of ['COACH', 'SCOUT', 'AGENT', 'MEDIA']) {
    assert.equal(isSearchablePerson({ ...base, role }, noExclusions), true, role);
  }
});

test('PRIVACY: guardian-managed (minor) is NEVER searchable', () => {
  assert.equal(isSearchablePerson({ ...base, guardianManaged: true }, noExclusions), false);
});
test('PRIVACY: non-discoverable (private / under-13-by-default) is NEVER searchable', () => {
  assert.equal(isSearchablePerson({ ...base, discoverable: false }, noExclusions), false);
});
test('PRIVACY: ADMIN accounts are never surfaced', () => {
  assert.equal(isSearchablePerson({ ...base, role: 'ADMIN' }, noExclusions), false);
});
test('PRIVACY: TEAM-role accounts are not shown under People', () => {
  assert.equal(isSearchablePerson({ ...base, role: 'TEAM' }, noExclusions), false);
});
test('PRIVACY: the viewer themselves is excluded', () => {
  assert.equal(isSearchablePerson(base, new Set(['u1'])), false);
});
test('PRIVACY: a blocked user (either direction) is excluded', () => {
  assert.equal(isSearchablePerson({ ...base, id: 'blocked-1' }, new Set(['blocked-1'])), false);
});
test('fails closed on a malformed row', () => {
  assert.equal(isSearchablePerson(null as any, noExclusions), false);
  assert.equal(isSearchablePerson({} as any, noExclusions), false);
});

// KEY: a guardian-managed row that a WRONG query somehow returned is still hidden.
test('KEY: re-check hides an ineligible row even if the query leaked it', () => {
  const leaked = { id: 'kid', role: 'ATHLETE', discoverable: true, guardianManaged: true };
  assert.equal(isSearchablePerson(leaked, noExclusions), false);
});

// ─── searchablePeopleWhere: the Prisma gate ──────────────────────────────────
test('searchablePeopleWhere encodes the full gate', () => {
  const w = searchablePeopleWhere(['me', 'blk']) as any;
  assert.equal(w.discoverable, true);
  assert.equal(w.guardianManaged, false);
  assert.deepEqual(w.role, { notIn: [...NON_PERSON_ROLES] });
  assert.deepEqual(w.id, { notIn: ['me', 'blk'] });
});
test('WHERE and re-check agree on the excluded roles', () => {
  // Every role the WHERE excludes must also be rejected by the predicate.
  for (const role of NON_PERSON_ROLES) {
    assert.equal(isSearchablePerson({ ...base, role }, noExclusions), false, role);
  }
});
