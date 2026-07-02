import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Role } from '@prisma/client';
import { validateProvisionInput, ProvisionError, ageFromDob, GUARDIAN_AGE_THRESHOLD } from './provisionAthlete';

const base = {
  name: 'Test Player',
  email: 'p@example.com',
  role: Role.ATHLETE,
  sport: 'BASKETBALL' as any,
  dateOfBirth: null as Date | null,
};

function dobForAge(age: number): Date {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - age);
  d.setUTCMonth(0, 2); // early in the year so the age is unambiguous today
  return d;
}

test('athlete without DOB is rejected', () => {
  assert.throws(() => validateProvisionInput({ ...base, dateOfBirth: null }), ProvisionError);
});

test('under-13 athlete without a guardian email is rejected', () => {
  assert.throws(
    () => validateProvisionInput({ ...base, dateOfBirth: dobForAge(10) }),
    /guardian email is required/i,
  );
});

test('under-13 athlete WITH a guardian email is accepted and flagged under13', () => {
  const { age, under13 } = validateProvisionInput({
    ...base,
    dateOfBirth: dobForAge(10),
    guardianEmail: 'parent@example.com',
  });
  assert.equal(under13, true);
  assert.equal(age, 10);
});

test('13+ athlete is accepted and not flagged under13', () => {
  const { under13 } = validateProvisionInput({ ...base, dateOfBirth: dobForAge(15) });
  assert.equal(under13, false);
});

test('coach without DOB is accepted (DOB only required for athletes)', () => {
  const { under13 } = validateProvisionInput({ ...base, role: Role.COACH, dateOfBirth: null });
  assert.equal(under13, false);
});

test('ageFromDob and the guardian threshold agree at the boundary', () => {
  assert.equal(ageFromDob(dobForAge(12)) < GUARDIAN_AGE_THRESHOLD, true);
  assert.equal(ageFromDob(dobForAge(13)) < GUARDIAN_AGE_THRESHOLD, false);
});
