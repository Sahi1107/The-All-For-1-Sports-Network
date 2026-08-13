import { test } from 'node:test';
import assert from 'node:assert/strict';
import { profileCompleteness } from './profileCompleteness';

const core = { name: 'A', bio: 'b', avatar: 'x.jpg', location: 'Goa' };
const athleteExtra = { sport: 'FOOTBALL', gender: 'MALE', age: 20, position: 'GK' };

test('staff (ADMIN/ORGANIZER) are always complete — no public profile to nag', () => {
  for (const role of ['ADMIN', 'ORGANIZER']) {
    assert.deepEqual(profileCompleteness({ role }), { complete: true, missing: [] });
  }
});

test('a fully-filled ATHLETE is complete', () => {
  assert.equal(profileCompleteness({ role: 'ATHLETE', ...core, ...athleteExtra }).complete, true);
});

test('BUG FIX: non-athlete roles are NOT asked for player fields (position/age/gender)', () => {
  // The core of the incident: a coach/scout/agent/media with a full basic profile
  // but no position must NOT be nagged. Previously this was `incomplete` forever.
  for (const role of ['COACH', 'SCOUT', 'AGENT', 'MEDIA', 'TEAM']) {
    const r = profileCompleteness({ role, ...core }); // no sport/gender/age/position
    assert.equal(r.complete, true, `${role} with a full basic profile must be complete`);
    assert.deepEqual(r.missing, [], `${role} must not be asked for player fields`);
  }
});

test('an ATHLETE missing a player field (sport/gender/age) is incomplete, and says which', () => {
  const r = profileCompleteness({ role: 'ATHLETE', ...core, sport: 'FOOTBALL', gender: 'MALE' }); // no age
  assert.equal(r.complete, false);
  assert.deepEqual(r.missing, ['age']);
});

test('an ATHLETE without a position is COMPLETE — position is admin/organiser-assignable, not the athlete\'s own incompleteness', () => {
  const r = profileCompleteness({ role: 'ATHLETE', ...core, sport: 'FOOTBALL', gender: 'MALE', age: 20 }); // no position
  assert.equal(r.complete, true);
  assert.deepEqual(r.missing, []);
});

test('any role missing a CORE field is incomplete (name/bio/avatar/location)', () => {
  for (const f of ['name', 'bio', 'avatar', 'location']) {
    const u: any = { role: 'SCOUT', ...core }; delete u[f];
    const r = profileCompleteness(u);
    assert.equal(r.complete, false, `missing ${f} must be incomplete`);
    assert.ok(r.missing.includes(f));
  }
});

test('blank/whitespace strings count as missing, not filled', () => {
  const r = profileCompleteness({ role: 'SCOUT', ...core, bio: '   ' });
  assert.equal(r.complete, false);
  assert.ok(r.missing.includes('bio'));
});
