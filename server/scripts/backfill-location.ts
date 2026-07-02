/**
 * Backfill the structured location columns (city/state/region/country) from the
 * existing free-text `location` string.
 *
 * SAFE BY DEFAULT: runs as a DRY RUN unless you pass --commit. The dry run reads
 * only — it writes nothing — and reports exactly what a real run would change.
 *
 * USAGE
 *   cd server
 *   # 1. Dry run (no writes) — review the counts and samples:
 *   DATABASE_URL=postgres://... npx ts-node scripts/backfill-location.ts
 *   # 2. Only after reviewing, and with a backup confirmed:
 *   DATABASE_URL=postgres://... npx ts-node scripts/backfill-location.ts --commit
 *
 * See docs/runbooks/backfill-location.md for the full safe procedure.
 *
 * Idempotent: only fills rows whose structured columns are still empty, so
 * re-running (dry or committed) never double-writes.
 */

import { Prisma } from '@prisma/client';
import prisma from '../src/config/db';
import { parseLocation } from '../src/data/locations';

const COMMIT = process.argv.includes('--commit');
const BATCH = 500;

async function main() {
  console.log(COMMIT ? '⚠️  COMMIT MODE — this will write to the database.' : '🔍 DRY RUN — no writes. Pass --commit to apply.');

  // Only rows that have a location string but haven't been structured yet.
  const where: Prisma.UserWhereInput = {
    location: { not: null },
    AND: [{ state: null }, { city: null }, { region: null }, { country: null }],
  };

  const total = await prisma.user.count({ where });
  console.log(`\nCandidates (have location, not yet structured): ${total}`);
  if (total === 0) {
    console.log('Nothing to backfill.');
    return;
  }

  let scanned = 0;
  let recognized = 0;   // state matched an India region
  let unrecognized = 0; // parsed, but state not in the region map (region stays null)
  let empty = 0;        // location present but unparseable into any part
  let written = 0;
  const samples: string[] = [];

  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.user.findMany({
      where,
      select: { id: true, location: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;

    const updates: { id: string; data: Record<string, string> }[] = [];
    for (const row of rows) {
      scanned++;
      const p = parseLocation(row.location);
      if (!p.country && !p.state && !p.city) { empty++; continue; }
      if (p.recognized) recognized++; else unrecognized++;

      const data: Record<string, string> = {};
      if (p.city) data.city = p.city;
      if (p.state) data.state = p.state;
      if (p.region) data.region = p.region;
      if (p.country) data.country = p.country;
      if (Object.keys(data).length === 0) continue;

      updates.push({ id: row.id, data });
      if (samples.length < 12) {
        samples.push(`  "${row.location}"  →  ${JSON.stringify(data)}`);
      }
    }

    if (COMMIT && updates.length) {
      await prisma.$transaction(
        updates.map((u) => prisma.user.update({ where: { id: u.id }, data: u.data })),
      );
      written += updates.length;
    }

    process.stdout.write(`\r  scanned ${scanned}/${total}…`);
  }

  console.log('\n\n── Summary ──────────────────────────────');
  console.log(`Scanned:               ${scanned}`);
  console.log(`Recognized state:      ${recognized}  (region resolved)`);
  console.log(`Unrecognized state:    ${unrecognized}  (parsed, region left null)`);
  console.log(`Unparseable:           ${empty}`);
  console.log(COMMIT ? `Rows written:          ${written}` : `Rows that WOULD update: ${scanned - empty}`);
  console.log('\nSample parses:');
  console.log(samples.join('\n'));
  if (!COMMIT) console.log('\nDry run only — nothing was written. Re-run with --commit to apply.');
}

main()
  .catch((e) => { console.error('Backfill failed:', e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
