import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateClaimCode,
  normalizeClaimCode,
  claimCodeHash,
  validateUnclaimedInput,
  validateLinkInput,
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

// ─── Admin link contract ─────────────────────────────────────────────────────
//
// linkUnclaimedProfile itself does I/O (Prisma + Firebase + email); what's pure
// and worth pinning here is WHEN the guardian gate fires, because that gate is
// the whole reason this path differs from creating a shell. A shell needs no
// guardian email — it has no credentials to issue. A link DOES issue them.

const shellOf = (over: Partial<{ role: 'ATHLETE' | 'COACH'; dateOfBirth: Date | null; age: number | null }> = {}) => ({
  role: 'ATHLETE' as const,
  dateOfBirth: new Date('2005-04-12'),
  age: null,
  ...over,
});

const yearsAgo = (n: number) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - n);
  return d;
};

test('linking an adult profile needs nothing but an email', () => {
  const r = validateLinkInput(shellOf(), { email: 'riya@example.com' });
  assert.equal(r.under13, false);
  assert.ok(r.age !== null && r.age > 13);
});

test('an email is required — a link with no identity to bind is meaningless', () => {
  assert.throws(() => validateLinkInput(shellOf(), { email: '   ' }), ProvisionError);
});

test('linking a KNOWN under-13 profile requires a guardian email', () => {
  // The gate that does not exist when the shell is created. If this stops
  // throwing, an admin can issue login credentials for a child's account with no
  // parent in the loop — the exact thing guardian consent exists to prevent.
  assert.throws(
    () => validateLinkInput(shellOf({ dateOfBirth: yearsAgo(10) }), { email: 'kid@example.com' }),
    (err: unknown) => err instanceof ProvisionError && err.code === 'GUARDIAN_EMAIL_REQUIRED',
  );
});

test('an under-13 link passes once a guardian email is supplied', () => {
  const r = validateLinkInput(
    shellOf({ dateOfBirth: yearsAgo(10) }),
    { email: 'kid@example.com', guardianEmail: 'parent@example.com' },
  );
  assert.equal(r.under13, true);
});

test('a blank guardian email does not satisfy the gate', () => {
  assert.throws(
    () => validateLinkInput(shellOf({ dateOfBirth: yearsAgo(9) }), { email: 'kid@example.com', guardianEmail: '  ' }),
    ProvisionError,
  );
});

test('a coach is never guardian-gated, whatever the stored date of birth says', () => {
  const r = validateLinkInput(shellOf({ role: 'COACH', dateOfBirth: yearsAgo(10) }), { email: 'coach@example.com' });
  assert.equal(r.under13, false);
});

test('an unknown age is not treated as a minor', () => {
  // Same honest gap as validateUnclaimedInput: most shells are rostered off a team
  // sheet with no birthday. We cannot gate on an age we do not have.
  const r = validateLinkInput(shellOf({ dateOfBirth: null }), { email: 'player@example.com' });
  assert.equal(r.age, null);
  assert.equal(r.under13, false);
});

test('the stored age is used only when there is no date of birth', () => {
  const r = validateLinkInput(shellOf({ dateOfBirth: null, age: 10 }), {
    email: 'kid@example.com', guardianEmail: 'parent@example.com',
  });
  assert.equal(r.under13, true);
});

test('a stale stored age never overrides the date of birth', () => {
  // `age` is a snapshot taken when the shell was created. A player rostered at 12
  // who is now 15 must link as an adult, not get stuck behind a guardian gate.
  const r = validateLinkInput(shellOf({ dateOfBirth: yearsAgo(15), age: 12 }), { email: 'teen@example.com' });
  assert.equal(r.age, 15);
  assert.equal(r.under13, false);
});

test('someone turning 13 today can be linked without a guardian', () => {
  assert.doesNotThrow(() => validateLinkInput(shellOf({ dateOfBirth: yearsAgo(13) }), { email: 'teen@example.com' }));
});
