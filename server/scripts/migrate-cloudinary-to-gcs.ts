/**
 * One-shot migration: download every Cloudinary asset and upload it to GCS.
 *
 * USAGE
 *   cd server
 *   GCS_BUCKET=allfor1-media GCP_PROJECT_ID=allfor1-prod \
 *     npx ts-node scripts/migrate-cloudinary-to-gcs.ts
 *
 * Optional flags:
 *   --dry-run     List assets without uploading
 *   --resume      Skip assets already present in the GCS bucket
 *
 * Output:
 *   server/cloudinary-to-gcs-mapping.json
 *     A JSON map of { cloudinaryUrl: gcsKey } that the rewrite-media-urls
 *     script consumes in the next phase.
 *
 * Safety:
 *   • Never deletes from Cloudinary.
 *   • Idempotent — re-running with --resume skips already-migrated files.
 *   • Mapping file is written incrementally (every 10 assets) so a crash
 *     doesn't lose progress.
 */

import { v2 as cloudinary } from 'cloudinary';
import { Storage } from '@google-cloud/storage';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { env } from '../src/config/env';

const DRY_RUN = process.argv.includes('--dry-run');
const RESUME  = process.argv.includes('--resume');

const MAPPING_FILE = path.join(__dirname, '..', 'cloudinary-to-gcs-mapping.json');

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key:    env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

if (!env.GCS_BUCKET) {
  console.error('ERROR: GCS_BUCKET env var must be set');
  process.exit(1);
}

const storage = new Storage({ projectId: env.GCP_PROJECT_ID || undefined });
const bucket = storage.bucket(env.GCS_BUCKET);

type Mapping = Record<string, string>;
const mapping: Mapping = (() => {
  if (RESUME && fs.existsSync(MAPPING_FILE)) {
    return JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf-8')) as Mapping;
  }
  return {};
})();

function saveMapping() {
  fs.writeFileSync(MAPPING_FILE, JSON.stringify(mapping, null, 2));
}

function downloadBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // follow redirect
          downloadBuffer(res.headers.location).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      })
      .on('error', reject);
  });
}

function gcsKeyForResource(resource: any): string {
  // resource.public_id already includes the folder, e.g. "allfor1/posts/abc123"
  // resource.format is the file extension, e.g. "jpg" or "mp4"
  // We strip the "allfor1/" prefix so the GCS layout is cleaner.
  const stripped = resource.public_id.replace(/^allfor1\//, '');
  return `${stripped}.${resource.format}`;
}

async function uploadOne(resource: any): Promise<void> {
  const cloudinaryUrl = resource.secure_url as string;
  const key = gcsKeyForResource(resource);

  if (RESUME && mapping[cloudinaryUrl]) {
    console.log(`SKIP (already mapped): ${cloudinaryUrl}`);
    return;
  }

  if (RESUME) {
    const [exists] = await bucket.file(key).exists();
    if (exists) {
      mapping[cloudinaryUrl] = key;
      console.log(`SKIP (already in GCS): ${key}`);
      return;
    }
  }

  if (DRY_RUN) {
    console.log(`DRY: ${cloudinaryUrl}  ->  gs://${env.GCS_BUCKET}/${key}`);
    mapping[cloudinaryUrl] = key;
    return;
  }

  const buffer = await downloadBuffer(cloudinaryUrl);
  const contentType =
    resource.resource_type === 'video'
      ? `video/${resource.format}`
      : `image/${resource.format}`;

  await bucket.file(key).save(buffer, {
    contentType,
    resumable: false,
    metadata: { cacheControl: 'public, max-age=31536000, immutable' },
  });

  mapping[cloudinaryUrl] = key;
  console.log(`OK   ${cloudinaryUrl}  ->  ${key}`);
}

async function migrateResourceType(resourceType: 'image' | 'video'): Promise<number> {
  console.log(`\n── Migrating ${resourceType}s ──`);
  let cursor: string | undefined;
  let count = 0;

  do {
    const result: any = await cloudinary.api.resources({
      resource_type: resourceType,
      type: 'upload',
      max_results: 100,
      next_cursor: cursor,
    });

    for (const resource of result.resources) {
      try {
        await uploadOne(resource);
        count++;
        if (count % 10 === 0) saveMapping();
      } catch (err) {
        console.error(`FAIL ${resource.secure_url}:`, err instanceof Error ? err.message : err);
      }
    }

    cursor = result.next_cursor;
  } while (cursor);

  saveMapping();
  return count;
}

(async () => {
  console.log(`Cloudinary → GCS migration${DRY_RUN ? ' (DRY RUN)' : ''}${RESUME ? ' (RESUME)' : ''}`);
  console.log(`  source : cloudinary/${env.CLOUDINARY_CLOUD_NAME}`);
  console.log(`  target : gs://${env.GCS_BUCKET}`);
  console.log(`  mapping: ${MAPPING_FILE}`);

  const images = await migrateResourceType('image');
  const videos = await migrateResourceType('video');

  console.log(`\nDone. ${images} images + ${videos} videos = ${images + videos} assets.`);
  console.log(`Mapping saved to ${MAPPING_FILE}.`);
})().catch((err) => {
  console.error('Migration failed:', err);
  saveMapping();
  process.exit(1);
});
