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

/** Single client origin for building links (CLIENT_URL may be a comma list). */
const clientOrigin = Array.isArray(env.CLIENT_URL) ? env.CLIENT_URL[0] : env.CLIENT_URL;

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

// ─── Bulk-provision welcome (temp password) ──────────────────────────────────

/**
 * Welcome an account created by an admin during tournament bulk-provisioning.
 * Gives the login email + temp password and tells the player to change it on
 * first login. Sent only to newly created accounts, never to linked ones.
 */
export async function sendTempPasswordWelcome(
  user: { email: string; name: string },
  tempPassword: string,
  tournamentName: string,
  teamName?: string,
): Promise<void> {
  const subject = `You're registered for ${tournamentName} — your All For 1 login`;
  const teamLine = teamName ? ` with team ${teamName}` : '';
  const text =
    `Hi ${user.name},\n\n` +
    `An organizer has registered you for ${tournamentName}${teamLine} on All For 1 and created an account for you.\n\n` +
    `Log in at ${clientOrigin}/login with:\n` +
    `  Email: ${user.email}\n` +
    `  Temporary password: ${tempPassword}\n\n` +
    `For your security, you'll be asked to set a new password the first time you log in.`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
      <h2 style="margin:0 0 16px">Welcome to All For 1</h2>
      <p>Hi ${user.name},</p>
      <p>An organizer has registered you for <strong>${tournamentName}</strong>${teamName ? ` with team <strong>${teamName}</strong>` : ''}
         and created an account for you.</p>
      <p style="margin:20px 0;padding:16px;background:#f4f4f8;border-radius:8px">
        <strong>Email:</strong> ${user.email}<br/>
        <strong>Temporary password:</strong> <code style="font-size:15px">${tempPassword}</code>
      </p>
      <p style="margin:24px 0">
        <a href="${clientOrigin}/login"
           style="background:#2929db;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;display:inline-block">
          Log in
        </a>
      </p>
      <p style="color:#666;font-size:13px">For your security, you'll be asked to set a new password the first
         time you log in.</p>
    </div>`;
  await sendMail({ to: user.email, subject, html, text });
}

// ─── Admin-created athlete: age-aware welcome ────────────────────────────────

/** Public app URL shown in onboarding copy. */
const APP_URL = 'https://allfor1.pro';

/**
 * Welcome an athlete account created by an admin (single or bulk). Age-aware:
 * for an under-13 account the recipient is the GUARDIAN (who controls it), so the
 * copy addresses the guardian and frames the steps as managing the child's
 * account; otherwise it addresses the athlete directly. Always includes the
 * login email, temp password, the get-started steps, and the app URL.
 */
export async function sendAthleteWelcome({
  to,
  athleteName,
  loginEmail,
  tempPassword,
  forGuardian,
}: {
  to: string;
  athleteName: string;
  loginEmail: string;
  tempPassword: string;
  forGuardian: boolean;
}): Promise<void> {
  const who = forGuardian ? `${athleteName}'s` : 'your';
  const greeting = forGuardian
    ? `You're set up to manage ${athleteName}'s account on All For 1.`
    : `Welcome to All For 1, ${athleteName}!`;
  const subject = forGuardian
    ? `${athleteName}'s All For 1 account — get started`
    : `Welcome to All For 1 — get started`;

  const steps = [
    `Log in at ${clientOrigin}/login`,
    `Reset the temporary password`,
    `Complete ${who} profile`,
    `View ${who} Performance Card`,
  ];

  const text =
    `${greeting}\n\n` +
    `All For 1 is the network where athletes build a profile, share highlights, ` +
    `join teams, and get discovered.\n\n` +
    `Log in with:\n` +
    `  Email: ${loginEmail}\n` +
    `  Temporary password: ${tempPassword}\n\n` +
    `Getting started:\n` +
    steps.map((s, i) => `  ${i + 1}. ${s}`).join('\n') +
    `\n\nThe app: ${APP_URL}\n\n` +
    `For security, you'll be asked to set a new password on first login.`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
      <h2 style="margin:0 0 16px">${greeting}</h2>
      <p>All For 1 is the network where athletes build a profile, share highlights,
         join teams, and get discovered.</p>
      <p style="margin:20px 0;padding:16px;background:#f4f4f8;border-radius:8px">
        <strong>Email:</strong> ${loginEmail}<br/>
        <strong>Temporary password:</strong> <code style="font-size:15px">${tempPassword}</code>
      </p>
      <p style="margin:0 0 8px"><strong>Getting started</strong></p>
      <ol style="margin:0 0 20px;padding-left:20px;line-height:1.7">
        ${steps.map((s) => `<li>${s}</li>`).join('')}
      </ol>
      <p style="margin:24px 0">
        <a href="${clientOrigin}/login"
           style="background:#2929db;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;display:inline-block">
          Log in
        </a>
      </p>
      <p style="color:#666;font-size:13px">The app: <a href="${APP_URL}">${APP_URL}</a><br/>
         For security, you'll be asked to set a new password on first login.</p>
    </div>`;

  await sendMail({ to, subject, html, text });
}

// ─── Admin-created under-13: guardian consent before activation ───────────────

/**
 * Ask the guardian to consent to an under-13 account an admin created. No login
 * credentials are issued until the guardian accepts via `consentUrl`; on consent
 * the guardian receives the welcome email with the temp password.
 */
export async function sendGuardianConsentInvite({
  to,
  athleteName,
  consentUrl,
}: {
  to: string;
  athleteName: string;
  consentUrl: string;
}): Promise<void> {
  const subject = `Consent needed to activate ${athleteName}'s All For 1 account`;
  const text =
    `An organizer has created an All For 1 account for ${athleteName}, who is under 13.\n\n` +
    `Because ${athleteName} is under 13, this account is private and cannot be used ` +
    `until you, as the parent or guardian, consent. Nothing is visible and no login ` +
    `is issued until you accept.\n\n` +
    `Review and give consent here:\n${consentUrl}\n\n` +
    `Once you consent, you'll receive the login details to manage ${athleteName}'s account.\n\n` +
    `If you did not expect this, you can ignore this email — the account stays inactive.`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
      <h2 style="margin:0 0 16px">Consent needed to activate an account</h2>
      <p>An organizer has created an All For 1 account for <strong>${athleteName}</strong>, who is under 13.</p>
      <p>Because ${athleteName} is under 13, the account is <strong>private and inactive</strong> until you,
         as the parent or guardian, consent. Nothing is visible and no login is issued until you accept.</p>
      <p style="margin:24px 0">
        <a href="${consentUrl}"
           style="background:#2929db;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;display:inline-block">
          Review &amp; give consent
        </a>
      </p>
      <p>Once you consent, you'll receive the login details to manage ${athleteName}'s account.</p>
      <p style="color:#666;font-size:13px">If you did not expect this, you can ignore this email —
         the account stays inactive.</p>
    </div>`;
  await sendMail({ to, subject, html, text });
}
