import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireRole } from './roles';
import type { AuthRequest } from './auth';
import type { Response } from 'express';

// The platform-admin surface (user directory, moderation, bulk provisioning, role
// changes, analytics) is guarded by `router.use(requireRole('ADMIN'))`. These
// tests prove an ORGANIZER — or any non-ADMIN — cannot cross that gate, which is
// the "organiser MUST NOT reach any platform-wide admin surface" boundary.

type Captured = { status?: number; body?: unknown; nexted: boolean };

function run(role: string | undefined): Captured {
  const captured: Captured = { nexted: false };
  const req = { user: role ? { userId: 'u1', email: 'e', role } : undefined } as unknown as AuthRequest;
  const res = {
    status(code: number) { captured.status = code; return this; },
    json(payload: unknown) { captured.body = payload; return this; },
  } as unknown as Response;
  requireRole('ADMIN')(req, res, () => { captured.nexted = true; });
  return captured;
}

test('SECURITY: an ORGANIZER is denied at a platform-ADMIN gate → 403, no next()', () => {
  const r = run('ORGANIZER');
  assert.equal(r.nexted, false);
  assert.equal(r.status, 403);
  assert.deepEqual(r.body, { error: 'Insufficient permissions' });
});

test('SECURITY: ordinary roles are denied at a platform-ADMIN gate → 403', () => {
  for (const role of ['ATHLETE', 'COACH', 'SCOUT']) {
    const r = run(role);
    assert.equal(r.nexted, false, `${role} must not pass`);
    assert.equal(r.status, 403);
  }
});

test('unauthenticated → 401 at a platform-ADMIN gate', () => {
  const r = run(undefined);
  assert.equal(r.nexted, false);
  assert.equal(r.status, 401);
});

test('ADMIN passes the platform-ADMIN gate', () => {
  const r = run('ADMIN');
  assert.equal(r.nexted, true);
  assert.equal(r.status, undefined);
});
