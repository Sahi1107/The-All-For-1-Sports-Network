// Exhaustive tests for THE public-athlete gate. This is the security-critical
// surface: the hard rule is "public iff discoverable === true AND age >= 13, with
// guardian-managed/under-13 explicitly excluded, DOB required, athletes only."
// Every boundary and every independent failure is asserted, plus the belt-and-
// suspenders re-check and the no-leak serializer.
//
// Run:  node --import tsx --test src/publicAthlete.test.ts

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PUBLIC_ATHLETE_MIN_AGE,
  minAgeCutoff,
  publicAthleteWhere,
  isPubliclyEligible,
  toPublicAthlete,
  getPublicAthlete,
  gateAndSerialize,
  parseSlugId,
  slugFor,
  kebab,
  type AthleteRow,
  type GateFields,
} from './publicAthlete';

// Fixed "now" so tests are deterministic.
const NOW = new Date(Date.UTC(2026, 6, 22)); // 2026-07-22
const CUTOFF = minAgeCutoff(NOW); // 2013-07-22 — DOB on/before = age >= 13

/** DOB exactly `years` before NOW (UTC). */
function dobYearsAgo(years: number): Date {
  return new Date(Date.UTC(NOW.getUTCFullYear() - years, NOW.getUTCMonth(), NOW.getUTCDate()));
}
function daysFrom(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

/** A fully-eligible gate-field baseline (overridable per test). */
function gate(overrides: Partial<GateFields> = {}): GateFields {
  return { role: 'ATHLETE', discoverable: true, guardianManaged: false, dateOfBirth: dobYearsAgo(20), ...overrides };
}

// ─── minAgeCutoff ────────────────────────────────────────────────────────────
test('minAgeCutoff is exactly MIN_AGE years before now (UTC, date-level)', () => {
  assert.equal(PUBLIC_ATHLETE_MIN_AGE, 13);
  assert.equal(CUTOFF.toISOString(), '2013-07-22T00:00:00.000Z');
});

// ─── isPubliclyEligible: the eligible baseline ───────────────────────────────
test('ELIGIBLE: athlete, discoverable, not guardian-managed, adult', () => {
  assert.equal(isPubliclyEligible(gate(), NOW), true);
});

// ─── AGE boundaries (computed from DOB) ──────────────────────────────────────
test('AGE: exactly 13 today (DOB == cutoff) → eligible (>= is inclusive)', () => {
  assert.equal(isPubliclyEligible(gate({ dateOfBirth: CUTOFF }), NOW), true);
});
test('AGE: 13y + 1 day (DOB one day before cutoff) → eligible', () => {
  assert.equal(isPubliclyEligible(gate({ dateOfBirth: daysFrom(CUTOFF, -1) }), NOW), true);
});
test('AGE: 12y + 364 days (DOB one day after cutoff) → NOT eligible', () => {
  assert.equal(isPubliclyEligible(gate({ dateOfBirth: daysFrom(CUTOFF, 1) }), NOW), false);
});
test('AGE: eligibility is NOT frozen in time — 12y+364d today becomes eligible tomorrow', () => {
  const dob = daysFrom(CUTOFF, 1);                          // one day too young as of NOW
  assert.equal(isPubliclyEligible(gate({ dateOfBirth: dob }), NOW), false);
  const tomorrow = daysFrom(NOW, 1);                        // advance "now" by one day
  assert.equal(isPubliclyEligible(gate({ dateOfBirth: dob }), tomorrow), true);
  // and the gate WHERE cutoff advances in lockstep
  assert.equal((publicAthleteWhere(tomorrow) as any).dateOfBirth.lte.toISOString(), dob.toISOString());
});
test('AGE: clearly under 13 (10 years old) → NOT eligible', () => {
  assert.equal(isPubliclyEligible(gate({ dateOfBirth: dobYearsAgo(10) }), NOW), false);
});

// ─── DOB required + valid ────────────────────────────────────────────────────
test('DOB null → NOT eligible (age unverifiable, fail closed)', () => {
  assert.equal(isPubliclyEligible(gate({ dateOfBirth: null }), NOW), false);
});
test('DOB invalid Date (NaN) → NOT eligible', () => {
  assert.equal(isPubliclyEligible(gate({ dateOfBirth: new Date('not-a-date') }), NOW), false);
});
test('DOB wrong type (string sneaked in) → NOT eligible', () => {
  assert.equal(isPubliclyEligible(gate({ dateOfBirth: '2000-01-01' as unknown as Date }), NOW), false);
});

// ─── discoverable ────────────────────────────────────────────────────────────
test('discoverable === false → NOT eligible (even as an adult athlete)', () => {
  assert.equal(isPubliclyEligible(gate({ discoverable: false }), NOW), false);
});

// ─── guardianManaged: explicit exclusion, never trust discoverable alone ─────
test('KEY: guardianManaged === true → NOT eligible EVEN IF discoverable && adult', () => {
  // A corrupted/over-permissive discoverable flag must not be enough.
  assert.equal(
    isPubliclyEligible(gate({ guardianManaged: true, discoverable: true, dateOfBirth: dobYearsAgo(30) }), NOW),
    false,
  );
});

// ─── role: athletes only ─────────────────────────────────────────────────────
for (const role of ['COACH', 'SCOUT', 'AGENT', 'TEAM', 'ADMIN', 'MEDIA']) {
  test(`role ${role} → NOT eligible (public athlete profiles only)`, () => {
    assert.equal(isPubliclyEligible(gate({ role }), NOW), false);
  });
}

// ─── combined adversarial ────────────────────────────────────────────────────
test('multiple violations at once (under-13 + guardian-managed) → NOT eligible', () => {
  assert.equal(isPubliclyEligible(gate({ guardianManaged: true, dateOfBirth: dobYearsAgo(9) }), NOW), false);
});

// ─── publicAthleteWhere encodes the same gate ────────────────────────────────
test('publicAthleteWhere encodes role/discoverable/guardianManaged/DOB-cutoff', () => {
  const w = publicAthleteWhere(NOW) as any;
  assert.equal(w.role, 'ATHLETE');
  assert.equal(w.discoverable, true);
  assert.equal(w.guardianManaged, false);
  assert.equal(w.dateOfBirth.not, null);
  assert.equal(w.dateOfBirth.lte.toISOString(), CUTOFF.toISOString());
});

// ─── toPublicAthlete: NO sensitive field ever leaks ──────────────────────────
function fullRow(overrides: Partial<AthleteRow> = {}): AthleteRow & Record<string, unknown> {
  return {
    id: '7f3a2b1c-9d4e-4f6a-8b2c-1234567890ab',
    name: 'Arjun Mehta',
    role: 'ATHLETE',
    discoverable: true,
    guardianManaged: false,
    dateOfBirth: dobYearsAgo(16),
    sport: 'BASKETBALL',
    position: 'Guard',
    height: "6'1\"",
    bio: 'Point guard from Maharashtra.',
    achievements: ['State champion 2025'],
    verified: true,
    state: 'Maharashtra',
    teamMemberships: [{ team: { name: 'Mumbai Strikers' } }, { team: { name: null } }],
    // Sensitive fields that must NEVER appear in output, even if present on the row:
    email: 'arjun@example.com',
    contactEmail: 'arjun.public@example.com',
    phone: '+919876543210',
    age: 16,
    city: 'Mumbai',
    region: 'West',
    location: 'Mumbai, Maharashtra',
    avatar: 'https://cdn/avatar.jpg',
    guardianEmail: 'parent@example.com',
    ...overrides,
  } as any;
}

const FORBIDDEN_KEYS = [
  'dateOfBirth', 'age', 'city', 'region', 'location', 'avatar',
  'email', 'contactEmail', 'phone', 'guardianEmail', 'guardianManaged',
  'discoverable', 'role', 'id', 'firebaseUid',
];
const ALLOWED_KEYS = ['slug', 'name', 'sport', 'position', 'height', 'bio', 'achievements', 'verified', 'state', 'teams'];

test('toPublicAthlete emits EXACTLY the allowed keys — nothing else', () => {
  const out = toPublicAthlete(fullRow());
  assert.deepEqual(Object.keys(out).sort(), [...ALLOWED_KEYS].sort());
});
test('toPublicAthlete leaks NONE of the forbidden fields', () => {
  const out = toPublicAthlete(fullRow()) as unknown as Record<string, unknown>;
  for (const k of FORBIDDEN_KEYS) assert.equal(k in out, false, `forbidden key leaked: ${k}`);
});
test('toPublicAthlete: state passes through, city never does', () => {
  const out = toPublicAthlete(fullRow());
  assert.equal(out.state, 'Maharashtra');
  assert.equal((out as unknown as Record<string, unknown>).city, undefined);
});
test('toPublicAthlete: teams = non-empty team names only', () => {
  assert.deepEqual(toPublicAthlete(fullRow()).teams, ['Mumbai Strikers']);
});
test('toPublicAthlete: safe defaults for missing optional fields', () => {
  const out = toPublicAthlete(fullRow({ sport: null, position: null, height: null, bio: null, achievements: [], teamMemberships: null }));
  assert.deepEqual(out.teams, []);
  assert.equal(out.sport, null);
  assert.deepEqual(out.achievements, []);
});

// ─── slug ────────────────────────────────────────────────────────────────────
test('slugFor: name-kebab + 12-hex id prefix', () => {
  assert.equal(slugFor({ id: '7f3a2b1c-9d4e-4f6a-8b2c-1234567890ab', name: 'Arjun Mehta' }), 'arjun-mehta-7f3a2b1c9d4e');
});
test('kebab: handles accents, punctuation, casing, and empty', () => {
  assert.equal(kebab('José Ramírez'), 'jose-ramirez');
  assert.equal(kebab("O'Brien-Smith"), 'o-brien-smith');
  assert.equal(kebab('   '), 'athlete');
});

// ─── getPublicAthlete: gate WHERE + belt-and-suspenders re-check ─────────────
test('getPublicAthlete passes the gate WHERE to the fetcher', async () => {
  let captured: any = null;
  const fetchRow = async (where: object) => { captured = where; return null; };
  await getPublicAthlete(fetchRow, 'some-id', NOW);
  assert.equal(captured.id, 'some-id');
  assert.equal(captured.role, 'ATHLETE');
  assert.equal(captured.discoverable, true);
  assert.equal(captured.guardianManaged, false);
  assert.equal(captured.dateOfBirth.lte.toISOString(), CUTOFF.toISOString());
});
test('getPublicAthlete: no row → null (→ 404)', async () => {
  assert.equal(await getPublicAthlete(async () => null, 'x', NOW), null);
});
test('KEY: getPublicAthlete re-gates — an ineligible row from a WRONG query still → null', async () => {
  // Simulate a broken/compromised query that returns a guardian-managed under-13.
  const leaky = async () => fullRow({ guardianManaged: true, dateOfBirth: dobYearsAgo(9), discoverable: true });
  assert.equal(await getPublicAthlete(leaky, 'x', NOW), null);
});
test('getPublicAthlete: eligible row → safe public object (no leaks)', async () => {
  const out = await getPublicAthlete(async () => fullRow(), 'x', NOW);
  assert.ok(out);
  assert.equal(out!.name, 'Arjun Mehta');
  assert.equal(out!.state, 'Maharashtra');
  assert.deepEqual(Object.keys(out!).sort(), [...ALLOWED_KEYS].sort());
});

// ─── gateAndSerialize: the DB-agnostic re-gate used by the SQL renderer path ──
test('gateAndSerialize: null row → null (not found / gated out)', () => {
  assert.equal(gateAndSerialize(null, NOW), null);
});
test('KEY: gateAndSerialize re-gates a would-be-leaked ineligible row → null', () => {
  assert.equal(gateAndSerialize(fullRow({ guardianManaged: true, dateOfBirth: dobYearsAgo(9) }), NOW), null);
});
test('gateAndSerialize: eligible row → safe object with exact key-set', () => {
  const out = gateAndSerialize(fullRow(), NOW);
  assert.ok(out);
  assert.deepEqual(Object.keys(out!).sort(), [...ALLOWED_KEYS].sort());
});

// ─── parseSlugId ─────────────────────────────────────────────────────────────
test('parseSlugId: extracts the 12-hex token from a canonical slug', () => {
  assert.equal(parseSlugId('arjun-mehta-7f3a2b1c9d4e'), '7f3a2b1c9d4e');
});
test('parseSlugId: round-trips with slugFor', () => {
  const row = { id: '7f3a2b1c-9d4e-4f6a-8b2c-1234567890ab', name: 'Arjun Mehta' };
  assert.equal(parseSlugId(slugFor(row)), '7f3a2b1c9d4e');
});
test('parseSlugId: no/short/invalid token → null', () => {
  assert.equal(parseSlugId('arjun-mehta'), null);
  assert.equal(parseSlugId('arjun-mehta-7f3a'), null);       // too short
  assert.equal(parseSlugId('arjun-mehta-ZZZZZZZZZZZZ'), null); // non-hex
});
