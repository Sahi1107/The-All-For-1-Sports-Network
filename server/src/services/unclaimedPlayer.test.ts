import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateClaimCode,
  normalizeClaimCode,
  claimCodeHash,
  validateUnclaimedInput,
} from './unclaimedPlayer';
import { ProvisionError } from './provisionAthlete';

// Pure helpers only — createUnclaimedPlayer / claimProfile do I/O (Prisma +
// Firebase) and are exercised against a real DB, not here. What IS tested here is
// the code format and the input contract, because those are the two things that
// silently ruin the feature: an ambiguous code that can't be read off a team
// sheet, or a shell created without the fields rankings need.

const base = {
  name: 'Riya Sharma',
  role: 'ATHLETE' as const,
  sport: 'BASKETBALL' as const,
  gender: 'FEMALE' as const,
  dateOfBirth: new Date('2005-04-12'),
  createdByOrganizerId: 'org-1',
};

// ─── Claim code format ───────────────────────────────────────────────────────

test('a claim code is two groups of four, hyphen-separated', () => {
  for (let i = 0; i < 200; i++) {
    assert.match(generateClaimCode(), /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  }
});

test('claim codes avoid visually ambiguous characters', () => {
  // O/0 and I/1/L are the classic misreads when a code is written on a team sheet
  // and typed in on a phone. None may ever appear.
  for (let i = 0; i < 500; i++) {
    const code = generateClaimCode();
    assert.ok(!/[O0IL1]/.test(code), `ambiguous character in ${code}`);
  }
});

test('claim codes are not obviously repeating', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 500; i++) seen.add(generateClaimCode());
  // 31^8 of space: 500 draws colliding would mean the generator is broken.
  assert.equal(seen.size, 500);
});

// ─── Normalisation ───────────────────────────────────────────────────────────

test('normalisation is case- and separator-insensitive', () => {
  const canonical = 'K7QP-3M2X';
  for (const variant of ['K7QP-3M2X', 'k7qp-3m2x', 'K7QP3M2X', 'k7qp 3m2x', ' K7QP-3M2X ', 'k7qp_3m2x']) {
    assert.equal(normalizeClaimCode(variant), canonical, `failed for ${JSON.stringify(variant)}`);
  }
});

test('a wrong-length code normalises to empty (never a partial match)', () => {
  for (const bad of ['', 'K7QP', 'K7QP-3M2X9', 'abc', '----']) {
    assert.equal(normalizeClaimCode(bad), '');
  }
});

test('the stored hash is stable across accepted spellings and is not the code', () => {
  const h = claimCodeHash('K7QP-3M2X');
  assert.equal(claimCodeHash('k7qp3m2x'), h);
  assert.notEqual(h, 'K7QP-3M2X');
  assert.match(h, /^[a-f0-9]{64}$/); // SHA-256 hex
});

test('different codes hash differently', () => {
  assert.notEqual(claimCodeHash('K7QP-3M2X'), claimCodeHash('K7QP-3M2Y'));
});

// ─── Input contract ──────────────────────────────────────────────────────────

test('a valid unclaimed player parses and derives age', () => {
  const r = validateUnclaimedInput(base);
  assert.equal(r.under13, false);
  assert.ok(r.age !== null && r.age > 13);
});

test('name is required', () => {
  assert.throws(() => validateUnclaimedInput({ ...base, name: '  ' }), ProvisionError);
});

test('gender is required — the ranking boards are split by it', () => {
  assert.throws(
    () => validateUnclaimedInput({ ...base, gender: undefined as never }),
    ProvisionError,
  );
});

test('a date of birth is OPTIONAL — an organiser rarely has one off a team sheet', () => {
  // Deliberately unlike provisionAthleteAccount, which requires it: that path
  // issues login credentials and DOB drives the under-13 consent gate. A shell
  // issues nothing, so requiring a birthday nobody knows would just block the
  // roster. If this starts throwing, adding players off a team sheet breaks.
  const r = validateUnclaimedInput({ ...base, dateOfBirth: null });
  assert.equal(r.age, null);
  assert.equal(r.under13, false); // unknown age is NOT assumed to be a minor
});

test('a coach does not need a date of birth either', () => {
  const r = validateUnclaimedInput({ ...base, role: 'COACH', dateOfBirth: null });
  assert.equal(r.age, null);
  assert.equal(r.under13, false);
});

test('an invalid date of birth is rejected rather than silently becoming NaN age', () => {
  assert.throws(() => validateUnclaimedInput({ ...base, dateOfBirth: new Date('nonsense') }), ProvisionError);
});

// ─── Minor safety ────────────────────────────────────────────────────────────

test('an under-13 athlete is flagged so the caller keeps the profile private', () => {
  const dob = new Date();
  dob.setUTCFullYear(dob.getUTCFullYear() - 9);
  const r = validateUnclaimedInput({ ...base, dateOfBirth: dob });
  assert.equal(r.under13, true);
});

test('an under-13 shell does NOT require a guardian email', () => {
  // Deliberate difference from provisionAthleteAccount: a guardian email gates
  // ISSUING CREDENTIALS, and a shell has none to issue. Safety comes from the
  // profile being private + guardian consent at claim time instead. If this ever
  // starts throwing, organisers can no longer roster under-13 players offline.
  const dob = new Date();
  dob.setUTCFullYear(dob.getUTCFullYear() - 10);
  assert.doesNotThrow(() => validateUnclaimedInput({ ...base, dateOfBirth: dob }));
});

test('someone turning 13 today is not treated as under 13', () => {
  const dob = new Date();
  dob.setUTCFullYear(dob.getUTCFullYear() - 13);
  assert.equal(validateUnclaimedInput({ ...base, dateOfBirth: dob }).under13, false);
});
