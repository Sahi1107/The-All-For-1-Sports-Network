// Dev-only: send every branded email template to a real inbox for eyeballing.
//   npx ts-node scripts/sendTestEmails.ts <to-address> [onlyNameSubstring]
// Uses the SMTP_* env already configured for the app. Credentials email goes first.
import nodemailer from 'nodemailer';
import { env } from '../src/config/env';
import { renderSampleEmails } from '../src/services/email';

const to = process.argv[2];
const only = process.argv[3];
if (!to || !/.+@.+\..+/.test(to)) {
  console.error('usage: ts-node scripts/sendTestEmails.ts <to-address> [onlyNameSubstring]');
  process.exit(1);
}
if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
  console.error('SMTP is not configured (SMTP_HOST/USER/PASS). Aborting.');
  process.exit(1);
}

const transport = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
});

(async () => {
  const all = renderSampleEmails();
  // Credentials email (the 114-player one) first, then the rest in order.
  const ordered = [...all].sort((a, b) =>
    (a.name.includes('temp-password') ? 0 : 1) - (b.name.includes('temp-password') ? 0 : 1));
  const list = only ? all.filter((e) => e.name.includes(only)) : ordered;

  console.log(`Sending ${list.length} test email(s) to ${to} from ${env.SMTP_FROM}\n`);
  for (const e of list) {
    await transport.sendMail({
      from: env.SMTP_FROM,
      to,
      subject: `[TEST] ${e.subject}`,
      html: e.html,
      text: e.text,
    });
    console.log(`  sent → ${e.name.padEnd(30)} “${e.subject}”`);
    await new Promise((r) => setTimeout(r, 900)); // gentle pacing
  }
  console.log(`\nDone. Check ${to} (and the spam folder, if a first send from this domain).`);
  process.exit(0);
})().catch((err) => {
  console.error('send failed:', err?.message ?? err);
  process.exit(1);
});
