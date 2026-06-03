import nodemailer from 'nodemailer';
import { env } from '../config/env';
import logger from '../utils/logger';

// ─── Transactional email service ─────────────────────────────────────────────
//
// Used for custom emails the app sends directly (Firebase still handles
// verification + password-reset emails). The transport is built from SMTP_*
// env vars; when those are unconfigured the service logs the message instead of
// throwing, so local/dev never breaks.

const smtpConfigured = !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);

const transport = smtpConfigured
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465, // SMTPS on 465, STARTTLS otherwise
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    })
  : null;

interface SendOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function sendMail({ to, subject, html, text }: SendOptions): Promise<void> {
  if (!transport) {
    logger.warn('email.not_configured', { to, subject, text });
    return;
  }
  await transport.sendMail({ from: env.SMTP_FROM, to, subject, html, text });
}

// ─── Guardian consent form (profile handover) ────────────────────────────────

/**
 * Email the parent/academy a consent form for handing an under-13 athlete's
 * account over to the athlete. The recipient clicks `consentUrl` to accept.
 */
export async function sendGuardianConsentEmail(
  to: string,
  { athleteName, consentUrl }: { athleteName: string; consentUrl: string },
): Promise<void> {
  const subject = `Consent requested: hand over ${athleteName}'s All For 1 account`;
  const text =
    `A request has been made to hand over the All For 1 account for ${athleteName}, ` +
    `which you currently manage as a parent or academy.\n\n` +
    `If you consent, ${athleteName} will be able to set their own email address and ` +
    `password and take full control of the account.\n\n` +
    `Review and accept the consent form here:\n${consentUrl}\n\n` +
    `If you did not expect this request, you can safely ignore this email — ` +
    `nothing will change unless you accept.`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
      <h2 style="margin:0 0 16px">Profile handover consent</h2>
      <p>A request has been made to hand over the All For 1 account for
         <strong>${athleteName}</strong>, which you currently manage as a parent or academy.</p>
      <p>If you consent, ${athleteName} will be able to set their own email address and
         password and take full control of the account.</p>
      <p style="margin:24px 0">
        <a href="${consentUrl}"
           style="background:#2929db;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;display:inline-block">
          Review &amp; accept consent form
        </a>
      </p>
      <p style="color:#666;font-size:13px">If you did not expect this request, you can safely ignore
         this email — nothing will change unless you accept.</p>
    </div>`;
  await sendMail({ to, subject, html, text });
}
