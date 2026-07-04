/**
 * Unit tests for the pure retrieval-engine helpers (no DB). searchAthletes
 * lazy-imports prisma, so importing this module triggers no side effects.
 *
 * Run with:  npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAthleteWhere, statThresholds, type RadarFilters } from './radarSearch';

// ─── Invariant 1: minor-safety (discoverable) is ALWAYS enforced ─────────────

test('discoverable:true is present for every filter combination (minor-safety never relaxes)', () => {
  const combos: RadarFilters[] = [
    {},
    { sport: 'BASKETBALL' },
    { role: 'COACH' },
    { position: 'point guard', sport: 'BASKETBALL' },
    { minAge: 18, maxAge: 25 },
    { city: 'Mumbai', state: 'Maharashtra' },
    { minPoints: 20, sport: 'BASKETBALL' },
    { sport: 'CRICKET', state: 'Tamil Nadu', minWickets: 10, position: 'bowler', minAge: 16 },
  ];
  for (const f of combos) {
    const where = buildAthleteWhere(f);
    assert.equal(where.discoverable, true, `discoverable must be true for ${JSON.stringify(f)}`);
  }
});

// ─── Invariant 2: sport is applied whenever named, never dropped ─────────────

test('sport is applied exactly as given whenever present', () => {
  assert.equal(buildAthleteWhere({ sport: 'FOOTBALL' }).sport, 'FOOTBALL');
  assert.equal(buildAthleteWhere({ sport: 'CRICKET', city: 'Chennai' }).sport, 'CRICKET');
  // absent sport → no sport constraint (search across sports), never invented
  assert.equal(buildAthleteWhere({ city: 'Delhi' }).sport, undefined);
});

test('role defaults to ATHLETE and is respected when provided', () => {
  assert.equal(buildAthleteWhere({}).role, 'ATHLETE');
  assert.equal(buildAthleteWhere({ role: 'COACH' }).role, 'COACH');
});

// ─── Structured location replaces free-text location ─────────────────────────

test('location filters use the structured city/state columns, not free-text location', () => {
  const where = buildAthleteWhere({ city: 'Bengaluru', state: 'Karnataka' }) as any;
  assert.deepEqual(where.city, { equals: 'Bengaluru', mode: 'insensitive' });
  assert.deepEqual(where.state, { equals: 'Karnataka', mode: 'insensitive' });
  assert.equal(where.location, undefined, 'must not fall back to free-text location');
});

test('only the provided location tier is constrained', () => {
  assert.equal((buildAthleteWhere({ state: 'Goa' }) as any).city, undefined);
  assert.equal((buildAthleteWhere({ city: 'Pune' }) as any).state, undefined);
  const none = buildAthleteWhere({ sport: 'FOOTBALL' }) as any;
  assert.equal(none.city, undefined);
  assert.equal(none.state, undefined);
});

// ─── Position + age wiring ───────────────────────────────────────────────────

test('a known position expands to an OR of canonical aliases', () => {
  const where = buildAthleteWhere({ sport: 'BASKETBALL', position: 'point guard' }) as any;
  assert.ok(Array.isArray(where.OR) && where.OR.length > 0, 'expected OR of position aliases');
  assert.ok(where.OR.every((c: any) => c.position?.mode === 'insensitive'));
});

test('age range maps to gte/lte', () => {
  assert.deepEqual((buildAthleteWhere({ minAge: 18 }) as any).age, { gte: 18 });
  assert.deepEqual((buildAthleteWhere({ maxAge: 21 }) as any).age, { lte: 21 });
  assert.deepEqual((buildAthleteWhere({ minAge: 18, maxAge: 21 }) as any).age, { gte: 18, lte: 21 });
});

// ─── statThresholds: sport-scoped, mismatches ignored ────────────────────────

test('statThresholds keeps only the query sport’s metrics', () => {
  assert.deepEqual(
    statThresholds('BASKETBALL', { minPoints: 20, minRebounds: 8, minAssists: 5 }),
    { points: 20, rebounds: 8, assists: 5 },
  );
  assert.deepEqual(statThresholds('FOOTBALL', { minGoals: 10, minAssists: 4 }), { goals: 10, assists: 4 });
  assert.deepEqual(statThresholds('CRICKET', { minRuns: 500, minWickets: 20 }), { runs: 500, wickets: 20 });
});

test('statThresholds ignores metrics that do not belong to the sport', () => {
  // minGoals is football-only → dropped for a basketball query (can't zero-out everyone)
  assert.deepEqual(statThresholds('BASKETBALL', { minGoals: 10, minPoints: 15 }), { points: 15 });
  // non-stat sport → no thresholds at all
  assert.deepEqual(statThresholds('TENNIS', { minPoints: 10 }), {});
  assert.deepEqual(statThresholds(undefined, { minRuns: 5 }), {});
});
