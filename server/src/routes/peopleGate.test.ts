import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guard-rail: every route that returns PEOPLE must apply the child-safety discovery
 * gate, or be explicitly allowlisted with a reason. Twice a people surface shipped
 * without the gate (the public contact email; raw follower/following lists), so this
 * makes it a build failure rather than a production discovery.
 *
 * It scans SOURCE (not runtime) — the gate is a query-level `where`, not middleware,
 * so it can't be seen in Express's layer stack. Mirrors routeGuards.test.ts.
 *
 *   "returns people" = the handler embeds a person's identity (a select/include with
 *                      both `name` and `avatar`) OR does a bare `prisma.user.findMany`.
 *   "gated"          = the handler body references one of the discovery/child-safety
 *                      gates below.
 *
 * Anything that returns people but isn't gated must be justified in ALLOWLIST —
 * forcing whoever adds a people-route to choose: gate it, or document why not.
 *
 * admin.routes.ts is skipped wholesale: its router is `requireRole('ADMIN')` at the
 * top (the admin console), so per-handler gating doesn't apply.
 */

const ROUTES_DIR = __dirname;
const SKIP_FILES = new Set(['admin.routes.ts']); // router-level ADMIN gate

const GATE_TOKENS = [
  'searchablePeopleWhere', 'isSearchablePerson', 'blockedUserIds',
  'socialListUsers', 'canSeeSocialLists', 'canInitiateContact',
  'athleteCardEligible', 'requireTournamentAccess', 'isPubliclyViewable',
  'rankedUserWhere', // leaderboard discovery gate (publicProfileWhere + guardianManaged:false)
];

// People-returning routes intentionally NOT discovery-gated, each with a reason.
// Keyed "<file> <METHOD> <path>". Categories: self (returns your own data),
// contextual (a relationship already exists), and product decisions (rosters shown
// as event participation; content-graph author identity shown as-is).
const ALLOWLIST: Record<string, string> = {
  // ── self: returns the caller's own data ──
  'auth.routes.ts POST /sync': 'returns the caller’s own synced account',
  'user.routes.ts PUT /profile': 'updates + returns your own profile',
  'post.routes.ts POST /': 'creates your own post',
  'post.routes.ts POST /:id/comments': 'creates your own comment',
  'highlight.routes.ts POST /': 'creates your own highlight',
  'endorsement.routes.ts POST /:athleteId': 'the endorsing coach (self)',
  'tournament.routes.ts POST /:id/register': 'self-service team registration',
  // ── contextual: a relationship already exists ──
  'user.routes.ts GET /blocked': 'your own block list — must show blocked users',
  'connection.routes.ts GET /requests': 'incoming requests: the sender already contacted you',
  'message.routes.ts GET /conversations': 'members of conversations you are already in',
  'notification.routes.ts GET /': 'actors who interacted with you directly',
  'invite.routes.ts GET /resolve/:code': 'holder of the invite code',
  'team.routes.ts POST /:teamId/members/me/accept': 'joining a team you were invited to',
  // ── product decision: rosters / participation shown as event participation ──
  'team.routes.ts GET /': 'team browse (captains) — participation',
  'team.routes.ts GET /:id': 'team roster — event participation',
  'tournament.routes.ts GET /:id/teams': 'tournament participants — event participation',
  'tournament.routes.ts GET /:id/leaders': 'stat leaders — competitive standing',
  // ── product decision: content-graph author identity shown as-is (block-filtered) ──
  'announcement.routes.ts GET /': 'announcement authors (broadcast content)',
  'announcement.routes.ts POST /': 'creating an announcement (author is self/admin)',
};

interface RouteDecl { method: string; path: string; body: string }

/** Every route declaration + the handler text from its path to the next route. */
function parseRoutes(src: string): RouteDecl[] {
  const re = /router\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]+)\2/g;
  const marks: Array<{ method: string; path: string; start: number; content: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) marks.push({ method: m[1], path: m[3], start: m.index, content: re.lastIndex });
  return marks.map((mk, i) => ({
    method: mk.method,
    path: mk.path,
    body: src.slice(mk.content, i + 1 < marks.length ? marks[i + 1].start : src.length),
  }));
}

/** A handler returns a person's identity if it embeds name+avatar or lists users. */
function returnsPeople(body: string): boolean {
  if (/prisma\.user\.findMany\(/.test(body)) return true;
  return /name:\s*true[\s\S]{0,260}?avatar:\s*true/.test(body)
    || /avatar:\s*true[\s\S]{0,260}?name:\s*true/.test(body);
}
const isGated = (body: string) => GATE_TOKENS.some((t) => body.includes(t));

const routeFiles = readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.routes.ts') && !SKIP_FILES.has(f));

test('every people-returning route is gated or explicitly allowlisted', () => {
  const holes: string[] = [];
  for (const f of routeFiles) {
    for (const r of parseRoutes(readFileSync(join(ROUTES_DIR, f), 'utf8'))) {
      if (!returnsPeople(r.body)) continue;
      const key = `${f} ${r.method.toUpperCase()} ${r.path}`;
      if (isGated(r.body) || key in ALLOWLIST) continue;
      holes.push(key);
    }
  }
  assert.deepEqual(
    holes, [],
    'these routes return people without the discovery gate — apply searchablePeopleWhere / ' +
    'isSearchablePerson / blockedUserIds (or the right gate), or add to ALLOWLIST with a reason',
  );
});

test('ALLOWLIST has no stale entries (each excuses a real ungated people-route)', () => {
  const ungated = new Set<string>();
  for (const f of routeFiles) {
    for (const r of parseRoutes(readFileSync(join(ROUTES_DIR, f), 'utf8'))) {
      if (returnsPeople(r.body) && !isGated(r.body)) ungated.add(`${f} ${r.method.toUpperCase()} ${r.path}`);
    }
  }
  const stale = Object.keys(ALLOWLIST).filter((k) => !ungated.has(k));
  assert.deepEqual(stale, [], 'stale ALLOWLIST entries — the route is gone or now gated; remove them');
});

// Guards the guard: the parser + detectors recognise known cases, so a broken
// heuristic can't pass everything by finding nothing.
test('people-gate detectors recognise known gated + people routes', () => {
  const searchRoutes = parseRoutes(readFileSync(join(ROUTES_DIR, 'search.routes.ts'), 'utf8')).filter((r) => returnsPeople(r.body));
  assert.ok(searchRoutes.length >= 1, 'parser should see the people route in search.routes.ts');
  assert.ok(searchRoutes.every((r) => isGated(r.body)), 'search people routes should read as gated');

  const suggestions = parseRoutes(readFileSync(join(ROUTES_DIR, 'connection.routes.ts'), 'utf8')).find((r) => r.path === '/suggestions');
  assert.ok(suggestions && returnsPeople(suggestions.body) && isGated(suggestions.body), 'suggestions must read as a gated people route');
});
