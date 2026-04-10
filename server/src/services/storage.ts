import { Storage } from '@google-cloud/storage';
import { env } from '../config/env';

// ─── GCS client ──────────────────────────────────────────────────────────────
//
// In production (Cloud Run) this picks up Application Default Credentials
// from the runtime service account automatically — no key file needed.
// Locally, run `gcloud auth application-default login` first.

const storage = new Storage({
  projectId: env.GCP_PROJECT_ID || undefined,
});

const bucket = env.GCS_BUCKET ? storage.bucket(env.GCS_BUCKET) : null;

// ─── Upload ──────────────────────────────────────────────────────────────────
//
// Uploads a buffer to GCS under `folder/<uuid>.<ext>` and returns the object
// key (NOT a full URL — the caller stores the key and we sign-on-read).

export async function uploadToGCS(
  buffer: Buffer,
  folder: string,
  ext: string,
  contentType: string,
): Promise<string> {
  if (!bucket) throw new Error('GCS_BUCKET not configured');

  // crypto.randomUUID is available on Node 18+
  const { randomUUID } = await import('crypto');
  const key = `${folder}/${randomUUID()}.${ext.replace(/^\./, '')}`;

  await bucket.file(key).save(buffer, {
    contentType,
    resumable: false,
    metadata: { cacheControl: 'public, max-age=31536000, immutable' },
  });

  return key;
}

// ─── Sign-on-read ────────────────────────────────────────────────────────────
//
// Bucket is private (org policy enforces public access prevention), so we
// mint a short-lived V4 signed URL each time we serve a media reference.
// 1 hour TTL is plenty for normal browsing and short enough that leaked URLs
// expire quickly.

const SIGN_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function signKey(key: string): Promise<string> {
  if (!bucket) throw new Error('GCS_BUCKET not configured');
  const [url] = await bucket.file(key).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + SIGN_TTL_MS,
  });
  return url;
}

// ─── Hybrid resolver ─────────────────────────────────────────────────────────
//
// During the migration the DB will contain a mix of:
//   • full Cloudinary URLs ("https://res.cloudinary.com/...")
//   • full GCS HTTPS URLs  ("https://storage.googleapis.com/...")  ← legacy
//   • bare GCS object keys ("posts/abc.jpg")                       ← new
//
// signMediaUrl detects which one it is and returns something the browser can
// fetch. Cloudinary URLs pass through unchanged (still valid until cutover),
// GCS keys get signed, and full GCS URLs are extracted and re-signed.
//
// Async because signing requires a network round trip to GCS metadata.

export async function signMediaUrl(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  // Already-signed V4 URLs are idempotent — don't re-sign and waste a round trip.
  if (value.includes('X-Goog-Signature=')) return value;
  if (value.startsWith('http://') || value.startsWith('https://')) {
    if (value.includes('res.cloudinary.com')) return value; // legacy passthrough
    // Strip storage.googleapis.com/<bucket>/ prefix if present
    const m = value.match(/storage\.googleapis\.com\/[^/]+\/(.+?)(\?|$)/);
    if (m) return signKey(decodeURIComponent(m[1]));
    return value;
  }
  return signKey(value);
}

// Bulk version for mapping over arrays of records
export async function signMediaUrls<T extends Record<string, any>>(
  records: T[],
  fields: (keyof T)[],
): Promise<T[]> {
  return Promise.all(
    records.map(async (record) => {
      const next = { ...record };
      for (const field of fields) {
        if (next[field]) {
          next[field] = (await signMediaUrl(next[field] as string)) as T[keyof T];
        }
      }
      return next;
    }),
  );
}

// ─── Feed-shaped signer ──────────────────────────────────────────────────────
//
// Walks the common nested shapes used across feed/post/highlight/user routes
// and signs every media field in place. Anything that isn't present is left
// alone, so the same helper works for posts, highlights, users, comments, etc.
//
// Recognized fields:
//   item.mediaUrl, item.videoUrl, item.thumbnailUrl, item.avatar, item.logo
//   item.user.avatar
//   item.media[].url
//   item.team.logo
//   item.followers[].avatar / item.following[].avatar
//   item.highlights[] (each: videoUrl, thumbnailUrl)

export async function signMediaDeep<T extends Record<string, any> | null | undefined>(
  item: T,
): Promise<T> {
  if (!item) return item;
  const node = item as any;

  if (typeof node.mediaUrl === 'string')     node.mediaUrl     = await signMediaUrl(node.mediaUrl);
  if (typeof node.videoUrl === 'string')     node.videoUrl     = await signMediaUrl(node.videoUrl);
  if (typeof node.thumbnailUrl === 'string') node.thumbnailUrl = await signMediaUrl(node.thumbnailUrl);
  if (typeof node.avatar === 'string')       node.avatar       = await signMediaUrl(node.avatar);
  if (typeof node.logo === 'string')         node.logo         = await signMediaUrl(node.logo);

  if (node.user)  await signMediaDeep(node.user);
  if (node.team)  await signMediaDeep(node.team);
  if (node.follower)  await signMediaDeep(node.follower);
  if (node.following) await signMediaDeep(node.following);

  if (Array.isArray(node.media)) {
    await Promise.all(
      node.media.map(async (m: any) => {
        if (m && typeof m.url === 'string') m.url = await signMediaUrl(m.url);
      }),
    );
  }
  if (Array.isArray(node.highlights)) {
    await Promise.all(node.highlights.map((h: any) => signMediaDeep(h)));
  }
  if (Array.isArray(node.teamMemberships)) {
    await Promise.all(node.teamMemberships.map((tm: any) => signMediaDeep(tm)));
  }

  return item;
}

export async function signMediaDeepAll<T extends Record<string, any>>(
  items: T[],
): Promise<T[]> {
  await Promise.all(items.map((i) => signMediaDeep(i)));
  return items;
}

// ─── Delete ──────────────────────────────────────────────────────────────────

export async function deleteFromGCS(key: string): Promise<void> {
  if (!bucket) throw new Error('GCS_BUCKET not configured');
  await bucket.file(key).delete({ ignoreNotFound: true });
}

export const isGCSConfigured = () => !!bucket;
