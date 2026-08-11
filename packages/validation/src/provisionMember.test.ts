import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProvisionMemberBody } from './tournament';

// Contract + scoping for the organiser "create a new player" path
// (POST /tournaments/:id/teams/:teamId/members/provision). The endpoint delegates
// account creation to provisionAthleteAccount (DOB / under-13 guardian / duplicate
// linking are validated + tested there); THIS schema is the input guard that keeps
// the path scoped and safe — it must not become a way to mint privileged accounts
// or accounts in an arbitrary sport.

const valid = { name: 'Priya Sharma', email: 'Priya@School.EDU', dateOfBirth: '2008-05-01', gender: 'FEMALE' };

test('valid new-player input parses; role defaults to ATHLETE; email normalised', () => {
  const r = ProvisionMemberBody.safeParse(valid);
  assert.ok(r.success);
  assert.equal(r.data.role, 'ATHLETE');
  assert.equal(r.data.email, 'priya@school.edu');
});

// Date of birth is conditional on the email, because the two paths differ in what
// they actually create: an email means real login credentials, and the under-13
// guardian-consent gate is applied from the DOB. A shell issues no credentials,
// so there is nothing to gate — and an organiser copying a team sheet usually
// doesn't have birthdays.
test('date of birth is mandatory WHEN an email is supplied (credentials path)', () => {
  const r = ProvisionMemberBody.safeParse({ ...valid, dateOfBirth: undefined });
  assert.equal(r.success, false);
  assert.equal(ProvisionMemberBody.safeParse({ ...valid, dateOfBirth: '' }).success, false);
});

test('date of birth is OPTIONAL with no email (unclaimed shell)', () => {
  const noEmail = { name: 'Priya Sharma', gender: 'FEMALE' as const };
  const r = ProvisionMemberBody.safeParse(noEmail);
  assert.ok(r.success);
  assert.equal(r.data.dateOfBirth, undefined);
  assert.equal(r.data.email, undefined);

  // Blank strings for both must behave exactly like omitting them.
  const blanks = ProvisionMemberBody.safeParse({ ...noEmail, email: '', dateOfBirth: '  ' });
  assert.ok(blanks.success);
  assert.equal(blanks.data.dateOfBirth, undefined);
});

test('a supplied date of birth is still validated on either path', () => {
  assert.equal(ProvisionMemberBody.safeParse({ name: 'A', gender: 'MALE', dateOfBirth: 'not-a-date' }).success, false);
});

test('gender stays mandatory even for a shell — the boards are split by it', () => {
  assert.equal(ProvisionMemberBody.safeParse({ name: 'A' }).success, false);
});

test('gender is mandatory (rankings split men’s/women’s)', () => {
  const r = ProvisionMemberBody.safeParse({ ...valid, gender: undefined });
  assert.equal(r.success, false);
});

test('an invalid date of birth is rejected', () => {
  const r = ProvisionMemberBody.safeParse({ ...valid, dateOfBirth: 'not-a-date' });
  assert.equal(r.success, false);
});

// Email is OPTIONAL: omitting it is what selects the unclaimed-profile path (a
// player rostered with no account, claimed later with a code). Both spellings of
// "no email" must normalise to undefined, because the route branches on exactly
// that — a stray '' would be treated as an address and fail account creation.
test('a missing or blank email is accepted and normalised to undefined', () => {
  const blank = ProvisionMemberBody.safeParse({ ...valid, email: '' });
  assert.ok(blank.success);
  assert.equal(blank.data.email, undefined);

  const absent = ProvisionMemberBody.safeParse({ ...valid, email: undefined });
  assert.ok(absent.success);
  assert.equal(absent.data.email, undefined);

  const spaces = ProvisionMemberBody.safeParse({ ...valid, email: '   ' });
  assert.ok(spaces.success);
  assert.equal(spaces.data.email, undefined);
});

test('a malformed email is still rejected when one IS supplied', () => {
  assert.equal(ProvisionMemberBody.safeParse({ ...valid, email: 'not-an-email' }).success, false);
  assert.equal(ProvisionMemberBody.safeParse({ ...valid, email: 'missing@domain' }).success, false);
});

test('COACH is allowed', () => {
  assert.ok(ProvisionMemberBody.safeParse({ ...valid, role: 'COACH' }).success);
});

// ─── Scoping guards ───────────────────────────────────────────────────────────

test('SECURITY: a privileged role cannot be requested through this path', () => {
  for (const role of ['ADMIN', 'ORGANIZER', 'SCOUT', 'AGENT', 'TEAM', 'MEDIA']) {
    const r = ProvisionMemberBody.safeParse({ ...valid, role });
    assert.equal(r.success, false, `role ${role} must be rejected`);
  }
});

test('SECURITY: a client-supplied sport is stripped — the endpoint uses the tournament’s sport', () => {
  const r = ProvisionMemberBody.safeParse({ ...valid, sport: 'BASKETBALL' });
  assert.ok(r.success);
  assert.equal((r.data as Record<string, unknown>).sport, undefined);
});

test('SECURITY: role/verified/mustResetPassword-style extras cannot be injected', () => {
  const r = ProvisionMemberBody.safeParse({ ...valid, verified: true, mustResetPassword: false, discoverable: true });
  assert.ok(r.success);
  const d = r.data as Record<string, unknown>;
  assert.equal(d.verified, undefined);
  assert.equal(d.mustResetPassword, undefined);
  assert.equal(d.discoverable, undefined);
});
