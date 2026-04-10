import { Request, Response, NextFunction } from 'express';
import { signMediaUrl } from '../services/storage';

// ─── Global media URL signer ─────────────────────────────────────────────────
//
// Wraps res.json so that any string field whose key looks like a media field
// is rewritten to a short-lived signed URL before the response is sent.
//
// This means individual routes don't have to remember to call signMediaDeep —
// they can return raw Prisma objects and the middleware handles signing.
//
// Recognized field names (case-sensitive, matching the Prisma schema):
//   avatar, logo, mediaUrl, videoUrl, thumbnailUrl
// Plus the special case `url` when the parent key is `media` (PostMedia rows).
//
// signMediaUrl is a no-op for already-signed URLs and Cloudinary URLs, so it's
// safe to call this on responses that have been partially signed elsewhere.

const MEDIA_KEYS = new Set(['avatar', 'logo', 'mediaUrl', 'videoUrl', 'thumbnailUrl']);

async function walk(node: any, parentKey?: string): Promise<void> {
  if (!node || typeof node !== 'object') return;

  if (Array.isArray(node)) {
    // PostMedia[] entries have a `url` string — sign that one specifically.
    if (parentKey === 'media') {
      await Promise.all(
        node.map(async (item) => {
          if (item && typeof item === 'object' && typeof item.url === 'string') {
            const signed = await signMediaUrl(item.url);
            if (signed != null) item.url = signed;
          }
          await walk(item, parentKey);
        }),
      );
      return;
    }
    await Promise.all(node.map((item) => walk(item, parentKey)));
    return;
  }

  // Object: sign any string fields whose key is a known media key.
  const tasks: Promise<void>[] = [];
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (typeof value === 'string' && MEDIA_KEYS.has(key)) {
      tasks.push(
        signMediaUrl(value).then((signed) => {
          if (signed != null) node[key] = signed;
        }),
      );
    } else if (value && typeof value === 'object') {
      tasks.push(walk(value, key));
    }
  }
  await Promise.all(tasks);
}

export function signMediaResponse(_req: Request, res: Response, next: NextFunction) {
  const originalJson = res.json.bind(res);
  res.json = ((body: any) => {
    // Fire-and-forget would lose ordering; we await via a microtask chain.
    walk(body)
      .then(() => originalJson(body))
      .catch((err) => {
        // If signing fails (e.g. missing IAM perms), fall back to unsigned data
        // rather than 500-ing the whole request — broken images beat downtime.
        console.error('signMediaResponse failed:', err);
        originalJson(body);
      });
    return res;
  }) as typeof res.json;
  next();
}
