import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyMediaValue, isSafeMediaValue, assertSafeMediaWrite, UnsafeMediaUrlError } from './mediaUrlPolicy';

// These columns are read back BY THE SERVER (the story-card renderer fetches the
// avatar to embed it), so an arbitrary URL in the column is an SSRF primitive.
// The policy is the write-side fix; these lock its edges.

test('our own object keys are accepted', () => {
  // The exact shape uploadToGCS mints: `${folder}/${randomUUID()}.${ext}`.
  // Hyphens are legal — a guard that rejected them would break every avatar
  // upload, so this is the regression test for that.
  assert.equal(classifyMediaValue('avatars/9f2c41d0-7b3a-4c8b-92e1-1f6d2b9f04c7.jpg'), 'key');
  assert.equal(classifyMediaValue('avatars/ab12cd34.jpg'), 'key');
  assert.equal(classifyMediaValue('avatars/nested/path/file.webp'), 'key');
  assert.equal(classifyMediaValue('a'), 'key');
});

test('whitespace and control characters are rejected', () => {
  assert.equal(classifyMediaValue(`avatars/a${String.fromCharCode(9)}b.jpg`), 'rejected', 'tab');
  assert.equal(classifyMediaValue(`avatars/a${String.fromCharCode(10)}b.jpg`), 'rejected', 'newline');
  assert.equal(classifyMediaValue(`avatars/a${String.fromCharCode(0)}b.jpg`), 'rejected', 'NUL');
  assert.equal(classifyMediaValue(`https://storage.googleapis.com/b/a${String.fromCharCode(13)}.jpg`), 'rejected', 'CR');
});

test('https URLs on our own media hosts are accepted', () => {
  assert.equal(classifyMediaValue('https://storage.googleapis.com/bucket/a.jpg'), 'allowed-host');
  assert.equal(classifyMediaValue('https://storage.googleapis.com/b/a.jpg?X-Goog-Signature=deadbeef'), 'allowed-host');
  assert.equal(classifyMediaValue('https://res.cloudinary.com/demo/image/upload/a.jpg'), 'allowed-host');
  assert.equal(classifyMediaValue('https://lh3.googleusercontent.com/a/default-user=s96-c'), 'allowed-host');
});

test('everything that could reach an internal or foreign host is rejected', () => {
  // The SSRF cases this guard exists for.
  assert.equal(classifyMediaValue('http://169.254.169.254/computeMetadata/v1/'), 'rejected');
  assert.equal(classifyMediaValue('https://169.254.169.254/computeMetadata/v1/'), 'rejected');
  assert.equal(classifyMediaValue('http://metadata.google.internal/computeMetadata/v1/'), 'rejected');
  assert.equal(classifyMediaValue('http://localhost:8080/internal'), 'rejected');
  assert.equal(classifyMediaValue('http://127.0.0.1/'), 'rejected');
  assert.equal(classifyMediaValue('https://10.0.0.5/admin'), 'rejected');
  assert.equal(classifyMediaValue('https://evil.com/a.png'), 'rejected');

  // Host spoofing: suffix-anchored matching, not substring.
  assert.equal(classifyMediaValue('https://storage.googleapis.com.evil.com/a.png'), 'rejected');
  assert.equal(classifyMediaValue('https://evil.com/storage.googleapis.com/a.png'), 'rejected');
  assert.equal(classifyMediaValue('https://notgoogleusercontent.com/a.png'), 'rejected', 'label boundary, not bare suffix');

  // Cleartext is refused even on an allowed host.
  assert.equal(classifyMediaValue('http://storage.googleapis.com/b/a.jpg'), 'rejected');

  // Non-http schemes and protocol-relative values are never keys.
  assert.equal(classifyMediaValue('file:///etc/passwd'), 'rejected');
  assert.equal(classifyMediaValue('data:image/png;base64,AAAA'), 'rejected');
  assert.equal(classifyMediaValue('javascript:alert(1)'), 'rejected');
  assert.equal(classifyMediaValue('//evil.com/a.png'), 'rejected');
  assert.equal(classifyMediaValue('../../etc/passwd'), 'rejected');
  assert.equal(classifyMediaValue('avatars/../../secret'), 'rejected');

  assert.equal(classifyMediaValue(''), 'rejected');
  assert.equal(classifyMediaValue('has space.jpg'), 'rejected');
  assert.equal(isSafeMediaValue('https://evil.com/a.png'), false);
});

// ── The write guard (wired into the Prisma client extension) ─────────────────
test('write guard blocks unsafe values in every payload shape', () => {
  const bad = 'http://169.254.169.254/computeMetadata/v1/';

  assert.throws(() => assertSafeMediaWrite('User', { avatar: bad }), UnsafeMediaUrlError, 'create/update data');
  assert.throws(() => assertSafeMediaWrite('User', { banner: bad }), UnsafeMediaUrlError, 'banner too');
  assert.throws(() => assertSafeMediaWrite('User', { avatar: { set: bad } }), UnsafeMediaUrlError, 'the { set } form');
  assert.throws(() => assertSafeMediaWrite('User', [{ avatar: 'ok/a.jpg' }, { avatar: bad }]), UnsafeMediaUrlError, 'createMany arrays');
});

test('write guard allows legitimate writes and clears', () => {
  assert.doesNotThrow(() => assertSafeMediaWrite('User', { avatar: 'avatars/ab12.jpg' }));
  assert.doesNotThrow(() => assertSafeMediaWrite('User', { avatar: 'https://res.cloudinary.com/demo/a.jpg' }));
  assert.doesNotThrow(() => assertSafeMediaWrite('User', { avatar: null }), 'clearing an avatar is fine');
  assert.doesNotThrow(() => assertSafeMediaWrite('User', { avatar: undefined }));
  assert.doesNotThrow(() => assertSafeMediaWrite('User', { name: 'Arjun' }), 'untouched field');
  assert.doesNotThrow(() => assertSafeMediaWrite('Match', { avatar: 'http://evil.com' }), 'unguarded model');
  assert.doesNotThrow(() => assertSafeMediaWrite('User', undefined));
});
