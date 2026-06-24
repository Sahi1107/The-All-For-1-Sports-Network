/**
 * Unit tests for the pure bulk-provisioning logic (validation, classification,
 * reshaping, temp-password generation). These import only the pure surface of
 * `bulkProvision` — the DB/Firebase deps are loaded lazily inside
 * `commitBulkProvision`, so importing here triggers no side effects.
 *
 * Run with:  npm test   (node --test via ts-node/register)
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReport,
  parseDob,
  ageFromDob,
  mapMemberRole,
  normalizeEmail,
  generateTempPassword,
  type RawRow,
  type TournamentContext,
} from './bulkProvision';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const tournament: TournamentContext = {
  id: '00000000-0000-0000-0000-000000000000',
  name: 'Summer Cup',
  sport: 'BASKETBALL' as any,
  genderCategory: null,
  minRosterSize: 5,
  maxRosterSize: 12,
};

/** Build a valid team of `playerCount` members (one captain + rest players). */
function makeTeam(teamName: string, playerCount: number, emailPrefix = 'p'): RawRow[] {
  const rows: RawRow[] = [];
  for (let i = 0; i < playerCount; i++) {
    rows.push({
      team_name: teamName,
      member_role: i === 0 ? 'captain' : 'player',
      name: `Player ${i}`,
      email: `${emailPrefix}${i}@example.com`,
      dob: '2005-01-01',
    });
  }
  return rows;
}

// ─── Email matching: new vs existing ─────────────────────────────────────────

test('classifies rows with no existing user as NEW', () => {
  const rows = makeTeam('Strikers', 5);
  const { report } = buildReport(rows, tournament, new Set());
  assert.equal(report.counts.newAccounts, 5);
  assert.equal(report.counts.linkedAccounts, 0);
  assert.ok(report.rows.every((r) => r.classification === 'NEW'));
});

test('classifies rows whose email already exists as EXISTING (linked)', () => {
  const rows = makeTeam('Strikers', 5);
  const existing = new Set(['p0@example.com', 'p2@example.com']);
  const { report } = buildReport(rows, tournament, existing);
  assert.equal(report.counts.linkedAccounts, 2);
  assert.equal(report.counts.newAccounts, 3);
  const linked = report.rows.filter((r) => r.classification === 'EXISTING').map((r) => r.email);
  assert.deepEqual(linked.sort(), ['p0@example.com', 'p2@example.com']);
});

test('email matching is case-insensitive (normalized to lowercase)', () => {
  const rows = makeTeam('Strikers', 5);
  rows[1].email = 'P1@Example.com';
  const { report } = buildReport(rows, tournament, new Set(['p1@example.com']));
  const row = report.rows[1];
  assert.equal(row.email, 'p1@example.com');
  assert.equal(row.classification, 'EXISTING');
});

// ─── Roster size validation ──────────────────────────────────────────────────

test('blocks a roster smaller than the tournament minimum', () => {
  const rows = makeTeam('Tiny', 4); // min is 5
  const { report } = buildReport(rows, tournament, new Set());
  assert.equal(report.canCommit, false);
  assert.ok(report.blockingErrors.some((e) => /Roster too small/.test(e)));
});

test('blocks a roster larger than the tournament maximum', () => {
  const rows = makeTeam('Huge', 13); // max is 12
  const { report } = buildReport(rows, tournament, new Set());
  assert.equal(report.canCommit, false);
  assert.ok(report.blockingErrors.some((e) => /Roster too large/.test(e)));
});

test('a roster within bounds is committable', () => {
  const rows = makeTeam('JustRight', 8);
  const { report } = buildReport(rows, tournament, new Set());
  assert.equal(report.canCommit, true);
  assert.equal(report.blockingErrors.length, 0);
  assert.equal(report.teams[0].playerCount, 8);
});

test('a coach does not count toward roster size', () => {
  const rows = makeTeam('WithCoach', 5);
  rows.push({ team_name: 'WithCoach', member_role: 'coach', name: 'Coach', email: 'coach@example.com', dob: '1980-01-01' });
  const { report } = buildReport(rows, tournament, new Set());
  assert.equal(report.canCommit, true);
  assert.equal(report.teams[0].playerCount, 5);
  assert.equal(report.teams[0].hasCoach, true);
});

// ─── Captain-required validation ─────────────────────────────────────────────

test('blocks a team with no captain', () => {
  const rows = makeTeam('NoCap', 5).map((r) => ({ ...r, member_role: 'player' }));
  const { report } = buildReport(rows, tournament, new Set());
  assert.equal(report.canCommit, false);
  assert.ok(report.blockingErrors.some((e) => /no captain/.test(e)));
});

test('blocks a team with more than one captain', () => {
  const rows = makeTeam('TwoCaps', 5);
  rows[1].member_role = 'captain';
  const { report } = buildReport(rows, tournament, new Set());
  assert.equal(report.canCommit, false);
  assert.ok(report.blockingErrors.some((e) => /2 captains/.test(e)));
});

test('blocks a team with more than one coach', () => {
  const rows = makeTeam('TwoCoaches', 5);
  rows.push({ team_name: 'TwoCoaches', member_role: 'coach', name: 'C1', email: 'c1@example.com' });
  rows.push({ team_name: 'TwoCoaches', member_role: 'coach', name: 'C2', email: 'c2@example.com' });
  const { report } = buildReport(rows, tournament, new Set());
  assert.equal(report.canCommit, false);
  assert.ok(report.blockingErrors.some((e) => /coaches/.test(e)));
});

// ─── Per-row errors ──────────────────────────────────────────────────────────

test('flags a bad date of birth as a row error', () => {
  const rows = makeTeam('BadDob', 5);
  rows[2].dob = '2010-02-31'; // not a real date
  const { report } = buildReport(rows, tournament, new Set());
  const row = report.rows[2];
  assert.equal(row.classification, 'ERROR');
  assert.ok(row.reasons.some((r) => /Invalid date of birth/.test(r)));
  assert.equal(report.canCommit, false);
});

test('flags missing email and invalid email', () => {
  const rows = makeTeam('BadEmail', 5);
  rows[1].email = '';
  rows[2].email = 'not-an-email';
  const { report } = buildReport(rows, tournament, new Set());
  assert.equal(report.rows[1].classification, 'ERROR');
  assert.equal(report.rows[2].classification, 'ERROR');
});

test('flags a duplicate email within the same team', () => {
  const rows = makeTeam('Dupes', 5);
  rows[3].email = rows[0].email;
  const { report } = buildReport(rows, tournament, new Set());
  assert.ok(report.rows[3].reasons.some((r) => /Duplicate email/.test(r)));
});

// ─── Minor / guardian warnings (non-blocking) ────────────────────────────────

test('surfaces a guardian warning for an under-13 with no guardian email, without blocking', () => {
  const rows = makeTeam('Youngsters', 5);
  const thisYear = new Date().getFullYear();
  rows[4].dob = `${thisYear - 10}-01-01`; // age ~10
  const { report } = buildReport(rows, tournament, new Set());
  assert.equal(report.canCommit, true); // warning, not error
  assert.ok(report.rows[4].warnings.some((w) => /guardian/i.test(w)));
});

// ─── ACCEPTED-on-create bypass (preview reflects committable members) ────────

test('a fully valid import reports the right member counts (all join as ACCEPTED on commit)', () => {
  // The ACCEPTED status itself is written in commitBulkProvision; here we assert
  // the preview treats every non-error member as a member that will be added.
  const rows = [...makeTeam('A', 5, 'a'), ...makeTeam('B', 6, 'b')];
  const { report, resolved } = buildReport(rows, tournament, new Set());
  assert.equal(report.canCommit, true);
  assert.equal(report.counts.teams, 2);
  assert.equal(report.counts.totalMembers, 11);
  // Every resolved row carries a concrete member role used for the ACCEPTED write.
  assert.ok(resolved.every((r) => ['CAPTAIN', 'PLAYER', 'COACH'].includes(r.memberRole)));
});

// ─── Helper-level tests ──────────────────────────────────────────────────────

test('parseDob accepts ISO and rejects garbage / overflow dates', () => {
  assert.ok(parseDob('2005-06-15') instanceof Date);
  assert.equal(parseDob('2010-02-31'), null);
  assert.equal(parseDob('nonsense'), null);
  assert.equal(parseDob(''), null);
  assert.equal(parseDob(undefined), null);
});

test('ageFromDob computes whole years', () => {
  const dob = new Date(Date.UTC(new Date().getFullYear() - 20, 0, 1));
  assert.equal(ageFromDob(dob), 20);
});

test('mapMemberRole maps known roles and rejects unknown', () => {
  assert.equal(mapMemberRole('captain'), 'CAPTAIN');
  assert.equal(mapMemberRole('Player'), 'PLAYER');
  assert.equal(mapMemberRole(' COACH '), 'COACH');
  assert.equal(mapMemberRole('manager'), null);
});

test('normalizeEmail trims and lowercases', () => {
  assert.equal(normalizeEmail('  Foo@Bar.COM '), 'foo@bar.com');
  assert.equal(normalizeEmail(undefined), '');
});

test('generateTempPassword meets the complexity policy', () => {
  for (let i = 0; i < 50; i++) {
    const pw = generateTempPassword();
    assert.ok(pw.length >= 8, 'length >= 8');
    assert.match(pw, /[a-z]/, 'has lowercase');
    assert.match(pw, /[A-Z]/, 'has uppercase');
    assert.match(pw, /[0-9]/, 'has digit');
  }
  // No two consecutive calls produce the same value.
  assert.notEqual(generateTempPassword(), generateTempPassword());
});
