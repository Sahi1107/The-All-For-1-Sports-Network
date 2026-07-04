/**
 * Unit tests for the pure retrieval-engine helpers (no DB). searchAthletes
 * lazy-imports prisma, so importing this module triggers no side effects.
 *
 * Run with:  npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAthleteWhere,
  buildBaseWhere,
  locationTiers,
  statThresholds,
  hasStatFilter,
  buildRelaxationSteps,
  emptyReasonFor,
  type RadarFilters,
} from './radarSearch';

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

// ─── Step 5: nearest-location widening ───────────────────────────────────────

test('city + state widens: city(+state) → state → region → country', () => {
  const tiers = locationTiers({ city: 'Mumbai', state: 'Maharashtra' });
  assert.deepEqual(tiers.map((t) => t.tier), ['city', 'state', 'region', 'country']);
  // narrowest tier constrains BOTH city and state
  assert.deepEqual((tiers[0].where as any).city,  { equals: 'Mumbai',      mode: 'insensitive' });
  assert.deepEqual((tiers[0].where as any).state, { equals: 'Maharashtra', mode: 'insensitive' });
  // Maharashtra resolves to the West macro-region
  assert.deepEqual((tiers[2].where as any).region, { equals: 'West', mode: 'insensitive' });
  // widest tier carries no location predicate
  assert.deepEqual(tiers[3].where, {});
});

test('state only widens: state → region → country', () => {
  const tiers = locationTiers({ state: 'Tamil Nadu' });
  assert.deepEqual(tiers.map((t) => t.tier), ['state', 'region', 'country']);
  assert.deepEqual((tiers[1].where as any).region, { equals: 'South', mode: 'insensitive' });
});

test('city only widens straight to country (no state ⇒ no region tier)', () => {
  const tiers = locationTiers({ city: 'Pune' });
  assert.deepEqual(tiers.map((t) => t.tier), ['city', 'country']);
});

test('no location ⇒ a single country tier (no widening concept)', () => {
  const tiers = locationTiers({ sport: 'FOOTBALL' });
  assert.deepEqual(tiers.map((t) => t.tier), ['country']);
  assert.deepEqual(tiers[0].where, {});
});

// ─── Invariants CANNOT leak through widening ─────────────────────────────────

test('the fixed base carries the invariants (discoverable + sport), location does not', () => {
  const base = buildBaseWhere({ sport: 'CRICKET', city: 'Chennai', state: 'Tamil Nadu', position: 'bowler', minAge: 16 });
  assert.equal(base.discoverable, true);
  assert.equal(base.sport, 'CRICKET');
  // location is NOT in the base — it belongs to the (widenable) tiers
  assert.equal((base as any).city, undefined);
  assert.equal((base as any).state, undefined);
  assert.equal((base as any).region, undefined);
});

test('NO location tier can relax sport or minor-safety (only touches location keys)', () => {
  const forbidden = ['discoverable', 'sport', 'role', 'age', 'OR', 'id', 'position'];
  const combos: RadarFilters[] = [
    { city: 'Mumbai', state: 'Maharashtra' },
    { state: 'Kerala' },
    { city: 'Delhi' },
    { sport: 'BASKETBALL', state: 'Goa', minPoints: 20 },
  ];
  for (const f of combos) {
    for (const { where } of locationTiers(f)) {
      const keys = Object.keys(where);
      for (const k of forbidden) {
        assert.ok(!keys.includes(k), `location tier for ${JSON.stringify(f)} must not touch "${k}" (found: ${keys.join(',')})`);
      }
      // every key present must be a location column
      for (const k of keys) {
        assert.ok(['city', 'state', 'region'].includes(k), `unexpected non-location key "${k}" in a widening tier`);
      }
    }
  }
});

// ─── Step 6: graceful-empty relaxation ───────────────────────────────────────

test('relaxation ladder drops soft filters progressively: stats → age → position', () => {
  const steps = buildRelaxationSteps({
    sport: 'BASKETBALL', position: 'point guard', minAge: 16, maxAge: 19, minPoints: 20, city: 'Mumbai', state: 'Maharashtra',
  });
  assert.deepEqual(steps.map((s) => s.dropped), [
    ['stats'],
    ['stats', 'age'],
    ['stats', 'age', 'position'],
  ]);
  // the last step keeps sport + location, drops all soft filters
  const last = steps[steps.length - 1].filters;
  assert.equal(last.position, undefined);
  assert.equal(last.minAge, undefined);
  assert.equal(last.minPoints, undefined);
  assert.equal(last.city, 'Mumbai');   // location is NOT a soft filter here — widening owns it
  assert.equal(last.state, 'Maharashtra');
});

test('only filters that are present produce a relaxation step (no redundant re-queries)', () => {
  assert.deepEqual(buildRelaxationSteps({ sport: 'FOOTBALL', minGoals: 10 }).map((s) => s.dropped), [['stats']]);
  assert.deepEqual(buildRelaxationSteps({ sport: 'FOOTBALL', position: 'striker' }).map((s) => s.dropped), [['position']]);
  assert.deepEqual(buildRelaxationSteps({ sport: 'FOOTBALL', maxAge: 21 }).map((s) => s.dropped), [['age']]);
  // no soft filters → nothing to relax → straight to the truly-empty case
  assert.deepEqual(buildRelaxationSteps({ sport: 'FOOTBALL', city: 'Delhi' }), []);
});

test('CRITICAL: no relaxation step ever drops sport or minor-safety', () => {
  const combos: RadarFilters[] = [
    { sport: 'BASKETBALL', position: 'point guard', minAge: 16, maxAge: 19, minPoints: 20 },
    { sport: 'CRICKET', position: 'bowler', minWickets: 10, state: 'Tamil Nadu' },
    { sport: 'FOOTBALL', minGoals: 10 },
  ];
  for (const f of combos) {
    for (const step of buildRelaxationSteps(f)) {
      assert.equal(step.filters.sport, f.sport, `sport must survive relaxation for ${JSON.stringify(f)}`);
      // relaxation only strips stats/age/position keys — never introduces a discoverable/role override
      assert.equal(step.dropped.includes('sport'), false);
      assert.equal(step.dropped.includes('minor-safety'), false);
      assert.equal((step.filters as any).discoverable, undefined); // discoverable is enforced server-side, not a filter
    }
  }
});

test('emptyReason distinguishes "no players of this sport" from a general empty', () => {
  assert.equal(emptyReasonFor({ sport: 'SWIMMING' }), 'no-athletes-in-sport');
  assert.equal(emptyReasonFor({ sport: 'BASKETBALL', city: 'Mumbai' }), 'no-athletes-in-sport');
  assert.equal(emptyReasonFor({ city: 'Delhi' }), 'no-athletes'); // no sport named
});

test('hasStatFilter detects any career-stat threshold', () => {
  assert.equal(hasStatFilter({ minPoints: 10 }), true);
  assert.equal(hasStatFilter({ minWickets: 5 }), true);
  assert.equal(hasStatFilter({ sport: 'BASKETBALL', position: 'guard' }), false);
});
