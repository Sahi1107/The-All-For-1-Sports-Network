import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPubliclyViewable, publicProfileWhere } from './profileVisibility';

// The predicate and the WHERE fragment express ONE rule. These tests pin both,
// and pin them against each other — if they drift, a player ranks on a public
// board but their profile 404s (or the reverse), which is exactly the failure
// this module exists to prevent.

const ordinary       = { discoverable: true,  claimStatus: null,        guardianManaged: false };
const privateAccount = { discoverable: false, claimStatus: null,        guardianManaged: false };
const unclaimed      = { discoverable: false, claimStatus: 'UNCLAIMED', guardianManaged: false };
const claimed        = { discoverable: true,  claimStatus: 'CLAIMED',   guardianManaged: false };
const minorShell     = { discoverable: false, claimStatus: 'UNCLAIMED', guardianManaged: true };
const minorOptedIn   = { discoverable: true,  claimStatus: null,        guardianManaged: true };

test('an ordinary discoverable account is viewable', () => {
  assert.equal(isPubliclyViewable(ordinary), true);
});

test('a deliberately private account is NOT viewable', () => {
  assert.equal(isPubliclyViewable(privateAccount), false);
});

test('an UNCLAIMED profile is viewable despite not being discoverable', () => {
  // This is the carve-out. Organiser-created players are kept out of people-search
  // and Radar (discoverable: false), but they play real matches, so their profile
  // page and their ranking entry must both work.
  assert.equal(isPubliclyViewable(unclaimed), true);
});

test('a claimed profile behaves like any ordinary account', () => {
  assert.equal(isPubliclyViewable(claimed), true);
});

test('SAFEGUARDING: an under-13 unclaimed shell is NOT publicly viewable', () => {
  assert.equal(isPubliclyViewable(minorShell), false);
});

test('a minor whose guardian opted them in stays viewable (no regression)', () => {
  // Guardians can switch a minor's profile to discoverable. The unclaimed
  // carve-out must not accidentally take that away.
  assert.equal(isPubliclyViewable(minorOptedIn), true);
});

// ─── The WHERE fragment must encode the same rule ────────────────────────────

test('the WHERE fragment admits exactly the discoverable and unclaimed-non-minor cases', () => {
  const where = publicProfileWhere() as { OR: Array<Record<string, unknown>> };
  assert.equal(where.OR.length, 2);
  assert.deepEqual(where.OR[0], { discoverable: true });
  assert.deepEqual(where.OR[1], { claimStatus: 'UNCLAIMED', guardianManaged: false });
});

test('the WHERE fragment and the predicate agree on every combination', () => {
  // Evaluate the fragment by hand over the full truth table and compare to the
  // predicate — the two are only useful if they cannot disagree.
  const where = publicProfileWhere() as { OR: Array<Record<string, unknown>> };
  const matches = (u: { discoverable: boolean; claimStatus: string | null; guardianManaged: boolean }) =>
    where.OR.some((clause) =>
      Object.entries(clause).every(([k, v]) => (u as Record<string, unknown>)[k] === v));

  for (const discoverable of [true, false]) {
    for (const claimStatus of [null, 'UNCLAIMED', 'CLAIMED']) {
      for (const guardianManaged of [true, false]) {
        const u = { discoverable, claimStatus, guardianManaged };
        assert.equal(
          matches(u), isPubliclyViewable(u),
          `disagreement for ${JSON.stringify(u)}`,
        );
      }
    }
  }
});
