import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inQuietHours, shouldEmailNow } from './notify';
import { effectivePref } from './preferences';
import { renderCopy } from './catalog';
import { qualifiesForViewTracking, shouldNotifyScoutView, viewerLeavesTrace } from './profileViews';
import { statLine, firstTimers } from './competitionNotify';

// ── Quiet hours ──────────────────────────────────────────────────────────────
test('quiet hours: unset bounds are never quiet', () => {
  assert.equal(inQuietHours(null, null, 3), false);
  assert.equal(inQuietHours(22, null, 23), false);
});
test('quiet hours: same-day window (end exclusive)', () => {
  assert.equal(inQuietHours(9, 17, 12), true);
  assert.equal(inQuietHours(9, 17, 8), false);
  assert.equal(inQuietHours(9, 17, 17), false);
});
test('quiet hours: overnight wraparound 22→7', () => {
  assert.equal(inQuietHours(22, 7, 23), true);
  assert.equal(inQuietHours(22, 7, 3), true);
  assert.equal(inQuietHours(22, 7, 7), false);
  assert.equal(inQuietHours(22, 7, 12), false);
});

// ── Fan-out email gate (anti-spam) ───────────────────────────────────────────
const go = { emailPref: true, digest: 'INSTANT' as const, paused: false, quiet: false, suppressEmail: false, created: true, alreadyEmailed: false, hasEmail: true };
test('emails when every gate is open', () => assert.equal(shouldEmailNow(go), true));
test('no email when the type email pref is off', () => assert.equal(shouldEmailNow({ ...go, emailPref: false }), false));
test('DAILY/WEEKLY defer to the digest job (no instant email)', () => {
  assert.equal(shouldEmailNow({ ...go, digest: 'DAILY' }), false);
  assert.equal(shouldEmailNow({ ...go, digest: 'WEEKLY' }), false);
});
test('global pause suppresses email', () => assert.equal(shouldEmailNow({ ...go, paused: true }), false));
test('quiet hours defer email', () => assert.equal(shouldEmailNow({ ...go, quiet: true }), false));
test('suppressEmail flag (sub-variant) blocks email', () => assert.equal(shouldEmailNow({ ...go, suppressEmail: true }), false));
test('collapse dedup: 12 likes ⇒ 1 email (no email on merge / already-emailed)', () => {
  assert.equal(shouldEmailNow({ ...go, created: false }), false);
  assert.equal(shouldEmailNow({ ...go, alreadyEmailed: true }), false);
});
test('no email without an address', () => assert.equal(shouldEmailNow({ ...go, hasEmail: false }), false));

// ── Preference resolution (override ?? default; SYSTEM forced on) ─────────────
test('no override falls back to the catalog default (LIKE email off, in-app on)', () => {
  const p = effectivePref('LIKE', null);
  assert.equal(p.inApp, true);
  assert.equal(p.email, false);
});
test('an override wins for a configurable type', () => {
  assert.deepEqual(effectivePref('LIKE', { inApp: false, email: true, digest: 'DAILY' }), { inApp: false, email: true, digest: 'DAILY' });
});
test('SYSTEM is non-configurable — forced fully on even with an override', () => {
  assert.deepEqual(effectivePref('SYSTEM', { inApp: false, email: false, digest: 'OFF' }), { inApp: true, email: true, digest: 'INSTANT' });
});
test('valuable/rare types default to instant email; noisy + connection types do not', () => {
  assert.equal(effectivePref('ENDORSEMENT', null).email, true);
  assert.equal(effectivePref('MATCH_RESULT_PUBLISHED', null).email, true);
  // Connection requests are intentionally in-app by default — NOT instant email. If a
  // user enables email it batches into the daily digest (the "emails too frequent" fix,
  // 4571b16). The digest assertion locks that intent against an accidental flip back.
  assert.equal(effectivePref('CONNECTION_REQUEST', null).email, false);
  assert.equal(effectivePref('CONNECTION_REQUEST', null).digest, 'DAILY');
  assert.equal(effectivePref('LIKE', null).email, false);
  assert.equal(effectivePref('REPOST', null).email, false);
});

// ── Collapse copy ────────────────────────────────────────────────────────────
test('renderCopy collapses LIKE into "N others"', () => {
  assert.equal(renderCopy('LIKE', { actorName: 'Priya', count: 1 }).message, 'Priya liked your post');
  assert.match(renderCopy('LIKE', { actorName: 'Priya', count: 5 }).message, /Priya and 4 others liked your post/);
});
test('profile-view collapse shows a count, never a name (privacy)', () => {
  assert.match(renderCopy('PROFILE_VIEW', { count: 6 }).message, /6 scouts and coaches viewed your profile/);
});

// ── Profile-view privacy guards ──────────────────────────────────────────────
const athlete = { id: 't', role: 'ATHLETE', discoverable: true, guardianManaged: false };
test('tracks discoverable adult athletes', () => assert.equal(qualifiesForViewTracking('v', athlete), true));
test('never a self-view', () => assert.equal(qualifiesForViewTracking('t', athlete), false));
test('never guardian-managed (under-13) profiles', () => assert.equal(qualifiesForViewTracking('v', { ...athlete, guardianManaged: true }), false));
test('never private (undiscoverable) profiles', () => assert.equal(qualifiesForViewTracking('v', { ...athlete, discoverable: false }), false));
test('never non-athletes', () => assert.equal(qualifiesForViewTracking('v', { ...athlete, role: 'COACH' }), false));
test('notifies only scouts/coaches, only the first view of the day', () => {
  assert.equal(shouldNotifyScoutView('SCOUT', true), true);
  assert.equal(shouldNotifyScoutView('COACH', true), true);
  assert.equal(shouldNotifyScoutView('ATHLETE', true), false);
  assert.equal(shouldNotifyScoutView('SCOUT', false), false);
});
test('private browsing leaves no trace (LinkedIn-style)', () => {
  assert.equal(viewerLeavesTrace(true), false);   // private → no record, no notify
  assert.equal(viewerLeavesTrace(false), true);
  assert.equal(viewerLeavesTrace(null), true);     // default (not set) → normal
});

// ── Match-result stat line (live-tournament copy) ────────────────────────────
test('statLine formats per sport and omits zeros', () => {
  assert.equal(statLine('FOOTBALL', { goals: 2, assists: 1 }), '2 goals, 1 assist');
  assert.equal(statLine('FOOTBALL', { goals: 1, assists: 0 }), '1 goal');
  assert.equal(statLine('BASKETBALL', { points: 18, rebounds: 5, assists: 0 }), '18 pts, 5 reb');
  assert.equal(statLine('CRICKET', { runs: 42, wickets: 2 }), '42 runs, 2 wkts');
  assert.equal(statLine('FOOTBALL', {}), '');
});
test('stats-verified fires only for first-timers (not those with prior stats)', () => {
  assert.deepEqual(firstTimers(['a', 'b', 'c'], new Set(['b'])), ['a', 'c']);
  assert.deepEqual(firstTimers(['a', 'a', 'b'], new Set()), ['a', 'b']); // dedups
  assert.deepEqual(firstTimers(['a'], new Set(['a'])), []);              // veteran → no notify
});
