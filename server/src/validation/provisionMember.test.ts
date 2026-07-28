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

test('date of birth is mandatory', () => {
  const r = ProvisionMemberBody.safeParse({ ...valid, dateOfBirth: undefined });
  assert.equal(r.success, false);
});

test('gender is mandatory (rankings split men’s/women’s)', () => {
  const r = ProvisionMemberBody.safeParse({ ...valid, gender: undefined });
  assert.equal(r.success, false);
});

test('an invalid date of birth is rejected', () => {
  const r = ProvisionMemberBody.safeParse({ ...valid, dateOfBirth: 'not-a-date' });
  assert.equal(r.success, false);
});

test('a missing/blank email is rejected', () => {
  assert.equal(ProvisionMemberBody.safeParse({ ...valid, email: '' }).success, false);
  assert.equal(ProvisionMemberBody.safeParse({ ...valid, email: undefined }).success, false);
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
