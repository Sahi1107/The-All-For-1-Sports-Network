/**
 * One-shot DB rewrite: replace every Cloudinary URL stored in the database
 * with the corresponding GCS object key, using the mapping file produced by
 * scripts/migrate-cloudinary-to-gcs.ts.
 *
 * USAGE
 *   cd server
 *   DATABASE_URL=postgres://... npx ts-node scripts/rewrite-media-urls.ts
 *
 * Optional flags:
 *   --dry-run   Print what would be updated without writing
 *
 * Tables touched:
 *   User.avatar
 *   Post.mediaUrl
 *   PostMedia.url
 *   Highlight.videoUrl
 *   Highlight.thumbnailUrl
 *   Team.logo
 *
 * Safety:
 *   • Wrapped in a single transaction — either everything updates or nothing.
 *   • Reads the mapping file produced by phase 1; the file is the source of
 *     truth for which Cloudinary URL maps to which GCS key.
 *   • Idempotent — re-running is a no-op because the second pass will not
 *     find any Cloudinary URLs left to rewrite.
 */

import fs from 'fs';
import path from 'path';
import prisma from '../src/config/db';

const DRY_RUN = process.argv.includes('--dry-run');
const MAPPING_FILE = path.join(__dirname, '..', 'cloudinary-to-gcs-mapping.json');

if (!fs.existsSync(MAPPING_FILE)) {
  console.error(`ERROR: mapping file not found at ${MAPPING_FILE}`);
  console.error('Run scripts/migrate-cloudinary-to-gcs.ts first.');
  process.exit(1);
}

type Mapping = Record<string, string>;
const mapping: Mapping = JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf-8'));
const cloudinaryUrls = Object.keys(mapping);
console.log(`Loaded ${cloudinaryUrls.length} Cloudinary→GCS mappings.`);

// Cloudinary delivery URLs sometimes have additional transformation segments
// (e.g. /upload/c_fill,w_400/...) so we need a tolerant lookup that compares
// by public_id rather than the exact URL string.
//
// Build a secondary index: { lastPathSegment: gcsKey } for fuzzy matches.
const fuzzyIndex: Record<string, string> = {};
for (const [url, key] of Object.entries(mapping)) {
  // Take the last meaningful path segment without query string or extension
  const m = url.match(/\/([^/?]+)(?:\?|$)/);
  if (m) {
    const tail = m[1].replace(/\.[^.]+$/, '');
    fuzzyIndex[tail] = key;
  }
}

function lookup(value: string | null | undefined): string | null {
  if (!value) return null;
  if (mapping[value]) return mapping[value];
  // Strip the .jpg thumbnail trick highlight.routes.ts used to apply
  const stripped = value.replace(/\.[^.]+$/, '');
  const m = stripped.match(/\/([^/?]+)$/);
  if (m && fuzzyIndex[m[1]]) return fuzzyIndex[m[1]];
  return null;
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'WRITE'}\n`);

  const stats = {
    user: 0,
    post: 0,
    postMedia: 0,
    highlightVideo: 0,
    highlightThumb: 0,
    team: 0,
  };

  // ─── Pre-fetch every row that has a media field ───────────────────────────
  const [users, posts, postMedia, highlights, teams] = await Promise.all([
    prisma.user.findMany({ where: { avatar: { not: null } }, select: { id: true, avatar: true } }),
    prisma.post.findMany({ where: { mediaUrl: { not: null } }, select: { id: true, mediaUrl: true } }),
    prisma.postMedia.findMany({ select: { id: true, url: true } }),
    prisma.highlight.findMany({ select: { id: true, videoUrl: true, thumbnailUrl: true } }),
    prisma.team.findMany({ where: { logo: { not: null } }, select: { id: true, logo: true } }),
  ]);

  // Build the list of Prisma update queries (unexecuted — `$transaction`
  // executes them atomically when we hand the array over).
  const updates: any[] = [];

  for (const u of users) {
    const next = lookup(u.avatar);
    if (next) {
      stats.user++;
      console.log(`USER  ${u.id}  ${u.avatar}  ->  ${next}`);
      if (!DRY_RUN) updates.push(prisma.user.update({ where: { id: u.id }, data: { avatar: next } }));
    }
  }

  for (const p of posts) {
    const next = lookup(p.mediaUrl);
    if (next) {
      stats.post++;
      console.log(`POST  ${p.id}  ${p.mediaUrl}  ->  ${next}`);
      if (!DRY_RUN) updates.push(prisma.post.update({ where: { id: p.id }, data: { mediaUrl: next } }));
    }
  }

  for (const m of postMedia) {
    const next = lookup(m.url);
    if (next) {
      stats.postMedia++;
      console.log(`MEDIA ${m.id}  ${m.url}  ->  ${next}`);
      if (!DRY_RUN) updates.push(prisma.postMedia.update({ where: { id: m.id }, data: { url: next } }));
    }
  }

  for (const h of highlights) {
    const nextVideo = lookup(h.videoUrl);
    const nextThumb = lookup(h.thumbnailUrl);
    if (nextVideo) {
      stats.highlightVideo++;
      console.log(`HVID  ${h.id}  ${h.videoUrl}  ->  ${nextVideo}`);
    }
    if (nextThumb) {
      stats.highlightThumb++;
      console.log(`HTHM  ${h.id}  ${h.thumbnailUrl}  ->  ${nextThumb}`);
    }
    if (!DRY_RUN && (nextVideo || nextThumb)) {
      updates.push(
        prisma.highlight.update({
          where: { id: h.id },
          data: {
            ...(nextVideo && { videoUrl: nextVideo }),
            ...(nextThumb && { thumbnailUrl: nextThumb }),
          },
        }),
      );
    }
  }

  for (const t of teams) {
    const next = lookup(t.logo);
    if (next) {
      stats.team++;
      console.log(`TEAM  ${t.id}  ${t.logo}  ->  ${next}`);
      if (!DRY_RUN) updates.push(prisma.team.update({ where: { id: t.id }, data: { logo: next } }));
    }
  }

  console.log('\n── Summary ──');
  console.log(stats);

  if (DRY_RUN) {
    console.log('\nDRY RUN — no changes written.');
    return;
  }

  console.log(`\nApplying ${updates.length} updates in a single transaction…`);
  await prisma.$transaction(updates);
  console.log('Done.');
}

main()
  .catch((err) => {
    console.error('Rewrite failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
