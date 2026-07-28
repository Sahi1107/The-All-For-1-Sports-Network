import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guard-rail against the one real hazard of moving tournament access control from
 * a router-level gate to per-route middleware: a NEW route added without a gate is
 * a silent hole. This test fails the build if any tournament-mutating route on the
 * tracker or tournament router is missing its access gate — the "route-count ==
 * gated-count" invariant, enforced as source assertions so it can't drift.
 *
 * It scans source (not runtime), because the gates are anonymous closures that
 * can't be identified by reference in Express's layer stack. If you add a route,
 * either gate it with requireTournamentAccess / requireRole('ADMIN'), or — if it's
 * deliberately public — add its path to the documented allowlist below with a note.
 */

const MUTATING = new Set(['post', 'put', 'patch', 'delete']);
const GUARD_TOKENS = ['requireTournamentAccess(', "requireRole('ADMIN')", 'requireRole("ADMIN")'];

interface RouteDecl { method: string; path: string; chain: string }

/** Extract every route declaration and the middleware text between its path and handler. */
function parseRoutes(src: string): RouteDecl[] {
  const routes: RouteDecl[] = [];
  const re = /router\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]+)\2/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const rest = src.slice(re.lastIndex);
    // The handler is the first `async (…)` / `(req…)` / `(_req…)` after the path;
    // everything before it is the middleware chain.
    const handlerIdx = rest.search(/async\s*\(|\(\s*_?req\b/);
    const chain = handlerIdx >= 0 ? rest.slice(0, handlerIdx) : rest.slice(0, 600);
    routes.push({ method: m[1], path: m[3], chain });
  }
  return routes;
}

const isGated = (r: RouteDecl) => GUARD_TOKENS.some((t) => r.chain.includes(t));
const read = (f: string) => readFileSync(join(__dirname, f), 'utf8');

// ─── Tracker router: EVERY route is tournament-scoped (no public, no ADMIN-only) ──
// This is the router that lost its blanket ADMIN gate, so the invariant is strict:
// every single route must carry requireTournamentAccess.
test('tracker.routes: every route is individually gated by requireTournamentAccess', () => {
  const routes = parseRoutes(read('tracker.routes.ts'));
  assert.ok(routes.length >= 10, `expected to find the tracker routes, found ${routes.length}`);

  const ungated = routes.filter((r) => !r.chain.includes('requireTournamentAccess('));
  assert.deepEqual(
    ungated.map((r) => `${r.method.toUpperCase()} ${r.path}`),
    [],
    'every tracker route must be gated by requireTournamentAccess — add the gate or, if truly public, this test needs a documented allowlist',
  );

  // route-count == gated-count, stated explicitly.
  const gatedCount = routes.filter((r) => r.chain.includes('requireTournamentAccess(')).length;
  assert.equal(gatedCount, routes.length, 'gated-count must equal route-count on the tracker router');
});

// ─── Tournament router: every MUTATING route is gated, save documented public ones ─
// This router legitimately mixes public reads, self-service, and scoped writes, so
// the invariant targets mutations: each must be ADMIN-only or tournament-scoped,
// unless explicitly allowlisted as public.
const PUBLIC_MUTATIONS = new Set<string>([
  'POST /:id/register', // self-service: a team captain registers their own team
]);

test('tournament.routes: every mutating route is gated (or explicitly public)', () => {
  const routes = parseRoutes(read('tournament.routes.ts'));
  const mutations = routes.filter((r) => MUTATING.has(r.method));
  assert.ok(mutations.length >= 8, `expected the tournament mutation routes, found ${mutations.length}`);

  const holes = mutations
    .filter((r) => !isGated(r) && !PUBLIC_MUTATIONS.has(`${r.method.toUpperCase()} ${r.path}`))
    .map((r) => `${r.method.toUpperCase()} ${r.path}`);

  assert.deepEqual(
    holes, [],
    'each mutating tournament route must carry requireTournamentAccess or requireRole("ADMIN") — ' +
    'gate it, or add it to PUBLIC_MUTATIONS with a reason if it is deliberately public',
  );
});

// Sanity: the parser actually recognises the guards it's looking for (guards the
// guard — a broken parser would otherwise pass everything by finding nothing).
test('route-guard parser recognises the known gates', () => {
  const trackerGated = parseRoutes(read('tracker.routes.ts')).filter(isGated);
  assert.ok(trackerGated.length >= 10, 'parser should see requireTournamentAccess on tracker routes');

  const adminGated = parseRoutes(read('tournament.routes.ts')).filter((r) => isGated(r) && r.chain.includes("requireRole('ADMIN')"));
  assert.ok(adminGated.length >= 2, 'parser should see requireRole(ADMIN) on create/delete tournament');
});
