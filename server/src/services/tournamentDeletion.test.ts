import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decideDeletion, deletionImpact, type DeletionDb, type DeletionImpact } from './tournamentDeletion';

// Deleting a tournament destroys real athlete records (published stats feed
// verified Performance Cards). These tests pin the safety gate and — the bug
// that started this — that NOTHING derived is left orphaned when a tournament
// goes, enforced at the schema-contract level.

const impact = (o: Partial<DeletionImpact>): DeletionImpact => ({
  name: 'Goa Cup', status: 'COMPLETED',
  teams: 0, registrations: 0, matches: 0, publishedMatches: 0,
  statRows: 0, playersAffected: 0, rankings: 0, organizers: 0,
  hasPublishedData: false, ...o,
});

// ── decideDeletion: the confirmation gate ──────────────────────────────────

test('missing tournament → 404, never a silent success', () => {
  const d = decideDeletion({ impact: null });
  assert.equal(d.ok, false);
  assert.equal(d.ok === false && d.status, 404);
});

test('no published data → deletes with a plain confirmation (no name needed)', () => {
  assert.deepEqual(decideDeletion({ impact: impact({ hasPublishedData: false }) }), { ok: true });
});

test('published data → refuses without the exact name typed', () => {
  const d = decideDeletion({ impact: impact({ hasPublishedData: true, name: 'Goa Cup' }), confirmName: null });
  assert.equal(d.ok, false);
  assert.equal(d.ok === false && d.status, 409);
  assert.equal(d.ok === false && d.code, 'CONFIRM_NAME_REQUIRED');
});

test('published data → a wrong name is still refused', () => {
  const d = decideDeletion({ impact: impact({ hasPublishedData: true, name: 'Goa Cup' }), confirmName: 'goa cup' });
  assert.equal(d.ok, false);
});

test('published data → the exact name unlocks the delete', () => {
  const d = decideDeletion({ impact: impact({ hasPublishedData: true, name: 'Goa Cup' }), confirmName: 'Goa Cup' });
  assert.deepEqual(d, { ok: true });
});

// ── deletionImpact: what the confirmation shows ────────────────────────────

test('impact dedups players across sports and flags published data', async () => {
  const db: DeletionDb = {
    tournament: { findUnique: async () => ({ id: 't1', name: 'Goa Cup', status: 'COMPLETED' }) },
    team: { count: async () => 4 },
    tournamentTeam: { count: async () => 4 },
    match: { count: async () => 6 },
    // publishedMatches uses match.count with a status filter — return via a 2nd call below
    basketballStats: { findMany: async () => [{ userId: 'a' }, { userId: 'b' }, { userId: 'a' }] },
    footballStats: { findMany: async () => [] },
    cricketStats: { findMany: async () => [{ userId: 'b' }] },
    playerRanking: { count: async () => 3 },
    tournamentOrganizer: { count: async () => 1 },
  };
  const res = await deletionImpact('t1', db);
  assert.ok(res);
  assert.equal(res!.statRows, 4);          // 3 bball + 0 fball + 1 cricket
  assert.equal(res!.playersAffected, 2);   // {a, b} deduped across sports
  assert.equal(res!.hasPublishedData, true);
});

test('impact returns null for a tournament that does not exist', async () => {
  const db = { tournament: { findUnique: async () => null } } as unknown as DeletionDb;
  assert.equal(await deletionImpact('nope', db), null);
});

// ── Schema invariant: NOTHING derived is left orphaned ─────────────────────
// The original bug: three stats models had a REQUIRED tournament relation with
// no onDelete, so Postgres RESTRICTed the delete (P2003) and the whole thing
// failed. This locks the class shut: every required Tournament relation must
// cascade, so a delete can never be blocked or leave orphaned rows behind.

test('every required Tournament relation cascades on delete', () => {
  const schema = readFileSync(join(__dirname, '../../prisma/schema.prisma'), 'utf8');
  // Relation fields whose TYPE is `Tournament` (required — no trailing `?`) that
  // carry an FK (fields: [...]). Optional `Tournament?` relations are allowed to
  // SetNull (they don't block a delete and don't orphan derived data).
  const offenders: string[] = [];
  for (const line of schema.split('\n')) {
    const l = line.trim();
    const isRequiredTournamentFk =
      /\bTournament\s+@relation\(/.test(l) && /fields:\s*\[/.test(l) && !/Tournament\?/.test(l);
    if (isRequiredTournamentFk && !/onDelete:\s*Cascade/.test(l)) {
      offenders.push(l);
    }
  }
  assert.deepEqual(
    offenders, [],
    `Required Tournament relations missing onDelete: Cascade would block deletion / orphan data:\n${offenders.join('\n')}`,
  );
});
