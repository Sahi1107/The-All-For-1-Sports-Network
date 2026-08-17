/**
 * One-time legal notice: email all users about the updated Terms & Privacy Policy
 * (the 2026-08-24 version). This is the "notify now" step — the operator runs it.
 *
 * SAFE BY DEFAULT: dry run unless you pass --send. The dry run sends nothing; it
 * reports how many recipients there are and shows a sample. Run the dry run first,
 * review, then re-run with --send (and SMTP_* configured) when you're ready.
 *
 * USAGE
 *   cd apps/server
 *   # 1. Dry run — no email sent, just counts + a sample:
 *   DATABASE_URL=postgres://... npx ts-node scripts/notify-policy-update.ts
 *   # 2. Only when ready, with SMTP configured:
 *   DATABASE_URL=postgres://... SMTP_HOST=... SMTP_USER=... SMTP_PASS=... \
 *     npx ts-node scripts/notify-policy-update.ts --send
 *
 * Recipient is the guardian's email for guardian-managed under-18 accounts (they
 * operate the account), otherwise the account email. Deduped by recipient address
 * so a guardian of several athletes gets one notice. Paced to avoid hammering SMTP.
 */
import prisma from '../src/config/db';
import { sendPolicyUpdateNotice } from '../src/services/email';

const SEND = process.argv.includes('--send');
const DELAY_MS = 200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const users = await prisma.user.findMany({
    where: { OR: [{ email: { not: null } }, { guardianEmail: { not: null } }] },
    select: { name: true, email: true, guardianManaged: true, guardianEmail: true },
  });

  // recipient = guardian for managed accounts, else the account email; dedupe by
  // address. Guardian-managed notices are addressed impersonally (name omitted).
  const byEmail = new Map<string, string | null>();
  for (const u of users) {
    const to = (u.guardianManaged ? u.guardianEmail : u.email) ?? u.email ?? u.guardianEmail;
    if (!to) continue;
    if (!byEmail.has(to)) byEmail.set(to, u.guardianManaged ? null : u.name);
  }
  const recipients = [...byEmail.entries()];

  console.log(`Recipients: ${recipients.length} (from ${users.length} accounts with an email)`);
  console.log('Sample:', recipients.slice(0, 5).map(([e]) => e));

  if (!SEND) {
    console.log('\nDRY RUN — nothing sent. Re-run with --send (and SMTP configured) to notify.');
    return;
  }

  let sent = 0;
  let failed = 0;
  for (const [to, name] of recipients) {
    try {
      await sendPolicyUpdateNotice(to, name);
      sent++;
    } catch (e) {
      failed++;
      console.error(`FAILED ${to}:`, (e as Error).message);
    }
    if (sent % 50 === 0 && sent > 0) console.log(`  sent ${sent}/${recipients.length}`);
    await sleep(DELAY_MS);
  }
  console.log(`\nDone. Sent ${sent}, failed ${failed}.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
