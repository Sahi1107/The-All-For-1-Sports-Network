// What may be stored in a media column (User.avatar, User.banner, ...).
//
// These columns are read back by the server, not just handed to the browser:
// the story-card renderer fetches the avatar to embed it in a PNG. A column
// that can hold an arbitrary URL therefore turns any such reader into an SSRF
// primitive from inside the VPC (link-local metadata, internal services). The
// allowlist on the read side is defence in depth; THIS is the fix — an unsafe
// value can never enter the column in the first place.
//
// Two shapes are legitimate, and nothing else:
//   1. a GCS object key we minted ourselves ("avatars/ab12.jpg") — the only
//      thing today's upload paths produce, and
//   2. an https URL on one of our own media hosts (legacy Cloudinary rows from
//      before the GCS cutover, signed GCS URLs, identity-provider pictures).

/** Hosts whose content we are willing to fetch or serve. Suffix-anchored, so
 *  `storage.googleapis.com.evil.com` does not match. */
const ALLOWED_HOSTS = /(^|\.)(storage\.googleapis\.com|res\.cloudinary\.com|googleusercontent\.com)$/;

/** A GCS object key: a relative path, no scheme, no protocol-relative prefix,
 *  no traversal, no control characters or whitespace. */
const GCS_KEY = /^[A-Za-z0-9][A-Za-z0-9._\-/]{0,511}$/;

export type MediaVerdict = 'key' | 'allowed-host' | 'rejected';

/** Whitespace or a control character: header-splitting / smuggling material,
 *  and never present in a key we minted. Written with explicit \u escapes so it
 *  cannot be misread as an ASCII range - hyphens ARE legal, since GCS keys are
 *  UUIDs (avatars/9f2c41d0-7b3a-....jpg). */
const WHITESPACE_OR_CONTROL = /[\s\u0000-\u001f]/;

export function classifyMediaValue(value: string): MediaVerdict {
  if (!value || WHITESPACE_OR_CONTROL.test(value)) return 'rejected';

  if (/^https?:\/\//i.test(value)) {
    let parsed: URL;
    try { parsed = new URL(value); } catch { return 'rejected'; }
    // http:// is refused even on an allowed host — we never fetch in cleartext.
    if (parsed.protocol !== 'https:') return 'rejected';
    return ALLOWED_HOSTS.test(parsed.hostname) ? 'allowed-host' : 'rejected';
  }

  // Anything else carrying a scheme or a protocol-relative prefix (file:,
  // data:, javascript:, //evil.com) is not a key.
  if (value.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(value)) return 'rejected';
  if (value.includes('..')) return 'rejected';
  return GCS_KEY.test(value) ? 'key' : 'rejected';
}

export const isSafeMediaValue = (value: string): boolean => classifyMediaValue(value) !== 'rejected';

/** Media columns guarded on write, by model. */
export const GUARDED_MEDIA_FIELDS: Record<string, string[]> = {
  User: ['avatar', 'banner'],
};

export class UnsafeMediaUrlError extends Error {
  constructor(public readonly model: string, public readonly field: string) {
    super(`Refusing to store an unsafe value in ${model}.${field}`);
    this.name = 'UnsafeMediaUrlError';
  }
}

/** Prisma write payloads put a scalar either bare or under `{ set }`. */
function scalarOf(input: unknown): string | null {
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object' && 'set' in (input as Record<string, unknown>)) {
    const set = (input as { set?: unknown }).set;
    if (typeof set === 'string') return set;
  }
  return null;
}

/** Throw if a write payload would put an unsafe value in a guarded column.
 *  Null/undefined (clearing the field) is always fine. */
export function assertSafeMediaWrite(model: string, data: unknown): void {
  const fields = GUARDED_MEDIA_FIELDS[model];
  if (!fields || !data) return;
  for (const row of Array.isArray(data) ? data : [data]) {
    if (!row || typeof row !== 'object') continue;
    for (const field of fields) {
      const value = scalarOf((row as Record<string, unknown>)[field]);
      if (value !== null && !isSafeMediaValue(value)) throw new UnsafeMediaUrlError(model, field);
    }
  }
}
