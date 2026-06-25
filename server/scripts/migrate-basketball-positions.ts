/**
 * One-shot DB rewrite: collapse the five granular basketball positions into the
 * three the app now uses.
 *
 *   Point Guard, Shooting Guard  ->  Guard
 *   Small Forward, Power Forward ->  Forward
 *   Center                       ->  Center (unchanged)
 *
 * USAGE
 *   cd server
 *   DATABASE_URL=postgres://... npx ts-node scripts/migrate-basketball-positions.ts
 *
 * Optional flags:
 *   --dry-run   Print what would be updated without writing
 *
 * Safety:
 *   • Wrapped in a single transaction — either everything updates or nothing.
 *   • Idempotent — re-running is a no-op because the collapsed values
 *     ("Guard"/"Forward") no longer match the old granular labels.
 *   • Matches on the position string only, tolerant of casing and the PG/SG/SF/PF
 *     abbreviations some rows may carry.
 */

import prisma from '../src/config/db';

const DRY_RUN = process.argv.includes('--dry-run');

/** Returns the collapsed position, or null if the value should be left as-is. */
function collapse(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();

  // Already collapsed — leave untouched (keeps the script idempotent).
  if (v === 'guard' || v === 'forward' || v === 'center' || v === 'centre') return null;

  if (v === 'point guard' || v === 'shooting guard' || v === 'pg' || v === 'sg') return 'Guard';
  if (v === 'small forward' || v === 'power forward' || v === 'sf' || v === 'pf') return 'Forward';

  return null;
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'WRITE'}\n`);

  const users = await prisma.user.findMany({
    where: { position: { not: null } },
    select: { id: true, position: true },
  });

  const updates: any[] = [];
  const stats = { guard: 0, forward: 0 };

  for (const u of users) {
    const next = collapse(u.position);
    if (!next) continue;

    if (next === 'Guard') stats.guard++;
    else stats.forward++;

    console.log(`USER ${u.id}  ${u.position}  ->  ${next}`);
    if (!DRY_RUN) {
      updates.push(prisma.user.update({ where: { id: u.id }, data: { position: next } }));
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
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
