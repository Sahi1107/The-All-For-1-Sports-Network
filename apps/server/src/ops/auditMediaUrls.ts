/**
 * Audit existing media columns against the write-time policy.
 *
 * The guard in config/db stops unsafe values entering the column from now on;
 * rows written BEFORE it existed were never validated, so this reports what is
 * actually in there. READ-ONLY by default — it writes nothing unless you pass
 * --fix, which nulls only the values the policy rejects (the athlete's avatar
 * falls back to their initials, which is what an empty avatar already does).
 *
 * The prod DB is private-IP, so this cannot run from a laptop. It lives under
 * src/ so the normal build compiles it into dist/ops/, and it runs as a Cloud
 * Run Job on the same image + VPC connector + secrets as the API:
 *   node dist/ops/auditMediaUrls.js          # report only
 *   node dist/ops/auditMediaUrls.js --fix    # null the rejected values
 *
 * Output deliberately prints the HOST (or a shape label), never the full URL —
 * enough to triage, without dumping user media paths into job logs.
 */
import prisma from '../config/db';
import { classifyMediaValue, GUARDED_MEDIA_FIELDS } from '../services/mediaUrlPolicy';

const FIX = process.argv.includes('--fix');

/** A label safe to log: the host for URLs, else the shape of the value. */
function label(value: string): string {
  if (/^https?:\/\//i.test(value)) {
    try { return `${new URL(value).protocol}//${new URL(value).hostname}`; }
    catch { return '(malformed url)'; }
  }
  if (value.startsWith('//')) return '(protocol-relative)';
  const scheme = value.match(/^([a-z][a-z0-9+.-]*):/i);
  if (scheme) return `(${scheme[1]}: scheme)`;
  if (value.includes('..')) return '(path traversal)';
  return '(unrecognised key shape)';
}

async function main() {
  let rejectedTotal = 0;

  for (const [model, fields] of Object.entries(GUARDED_MEDIA_FIELDS)) {
    const delegate = (prisma as unknown as Record<string, {
      findMany: (a: unknown) => Promise<Array<Record<string, unknown>>>;
      update: (a: unknown) => Promise<unknown>;
    }>)[model.charAt(0).toLowerCase() + model.slice(1)];

    for (const field of fields) {
      const rows = await delegate.findMany({
        where: { [field]: { not: null } },
        select: { id: true, [field]: true },
      });

      const counts = { key: 0, 'allowed-host': 0, rejected: 0 } as Record<string, number>;
      const byLabel = new Map<string, number>();
      const badIds: string[] = [];

      for (const row of rows) {
        const value = row[field] as string;
        const verdict = classifyMediaValue(value);
        counts[verdict]++;
        if (verdict === 'rejected') {
          badIds.push(row.id as string);
          const l = label(value);
          byLabel.set(l, (byLabel.get(l) ?? 0) + 1);
        }
      }

      console.log(`\n${model}.${field}: ${rows.length} non-null`);
      console.log(`  gcs key      ${counts.key}`);
      console.log(`  allowed host ${counts['allowed-host']}`);
      console.log(`  REJECTED     ${counts.rejected}`);
      if (byLabel.size) {
        console.log('  rejected by source:');
        for (const [l, n] of [...byLabel.entries()].sort((a, b) => b[1] - a[1])) {
          console.log(`    ${n.toString().padStart(5)}  ${l}`);
        }
        console.log(`  first ids: ${badIds.slice(0, 10).join(', ')}`);
      }
      rejectedTotal += counts.rejected;

      if (FIX && badIds.length) {
        // One row at a time: the write guard is on updateMany too, and nulling
        // is always allowed, so this is safe — but per-row keeps the log honest
        // about what changed.
        for (const id of badIds) await delegate.update({ where: { id }, data: { [field]: null } });
        console.log(`  cleared ${badIds.length} rejected value(s)`);
      }
    }
  }

  if (!rejectedTotal) {
    console.log('\nClean: every stored media value satisfies the policy.');
  } else if (!FIX) {
    console.log(`\n${rejectedTotal} rejected value(s). Re-run with --fix to null them.`);
    console.log('Until then they are inert: readers re-check the policy and fall back.');
  }
}

if (require.main === module) {
  main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
}
