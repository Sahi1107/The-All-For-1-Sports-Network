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
  replyTo?: string;
  headers?: Record<string, string>;
}

async function sendMail({ to, subject, html, text, replyTo, headers }: SendOptions): Promise<void> {
  if (!transport) {
    // A missing transport in production is a real misconfiguration — throw so callers
    // log a genuine failure instead of a false "sent". Dev/local stays a silent no-op.
    if (env.NODE_ENV === 'production') {
      throw new Error('email.not_configured: SMTP is not configured in production');
    }
    logger.warn('email.not_configured', { to, subject, text });
    return;
  }
  await transport.sendMail({ from: env.SMTP_FROM, to, subject, html, text, ...(replyTo && { replyTo }), ...(headers && { headers }) });
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
  const subject = forGuardian
    ? `${athleteName}'s All For 1 account — get started`
    : `Welcome to All For 1 — make your sports journey visible`;

  const steps = [
    `Log in at ${clientOrigin}/login`,
    `Reset the temporary password`,
    `Complete ${who} profile`,
    `View ${who} Performance Card`,
  ];

  // Shared blocks (identical wording in both paths).
  const creds =
    `Log in with:\n` +
    `  Email: ${loginEmail}\n` +
    `  Temporary password: ${tempPassword}`;
  const startedText =
    `Getting started:\n` + steps.map((s, i) => `  ${i + 1}. ${s}`).join('\n');
  const security = `For security, you'll be asked to set a new password on first login.`;

  let text: string;
  let html: string;

  if (forGuardian) {
    // ── Under-13 guardian welcome (sent after consent) — copy unchanged ──
    const greeting = `You're set up to manage ${athleteName}'s account on All For 1.`;
    text =
      `${greeting}\n\n` +
      `All For 1 is the network where athletes build a profile, share highlights, ` +
      `join teams, and get discovered.\n\n` +
      `${creds}\n\n` +
      `${startedText}` +
      `\n\nThe app: ${APP_URL}\n\n` +
      `${security}`;
    html = `
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
         ${security}</p>
    </div>`;
  } else {
    // ── 13+ athlete welcome — "make your sports journey visible" ──
    text =
      `Welcome to All For 1, ${athleteName} — this is where your game gets seen.\n\n` +
      `All For 1 is the home for your sports journey. Build a standout athlete profile, ` +
      `showcase your best highlights, track your stats, and put your talent in front of the ` +
      `scouts, coaches, and academies who are looking for players like you.\n\n` +
      `What you can do here:\n` +
      `  • Build your Performance Card — one shareable page for your stats, highlights, and achievements\n` +
      `  • Get discovered — scouts, coaches, and academies find athletes directly on All For 1\n` +
      `  • Let your highlights do the talking — upload your best moments for the world to see\n` +
      `  • Compete and climb — join tournaments, represent teams, and rise up the rankings\n\n` +
      `${creds}\n\n` +
      `${startedText}\n\n` +
      `Make your sports journey visible. The app: ${APP_URL}\n\n` +
      `${security}`;
    html = `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
      <h2 style="margin:0 0 6px">Welcome to All For 1, ${athleteName}</h2>
      <p style="margin:0 0 16px;color:#2929db;font-weight:600;font-size:15px">This is where your game gets seen.</p>
      <p>All For 1 is the home for your sports journey. Build a standout athlete profile,
         showcase your best highlights, track your stats, and put your talent in front of the
         scouts, coaches, and academies who are looking for players like you.</p>
      <p style="margin:18px 0 8px"><strong>What you can do here</strong></p>
      <ul style="margin:0 0 20px;padding-left:20px;line-height:1.7">
        <li><strong>Build your Performance Card</strong> — one shareable page for your stats, highlights, and achievements</li>
        <li><strong>Get discovered</strong> — scouts, coaches, and academies find athletes directly on All For 1</li>
        <li><strong>Let your highlights do the talking</strong> — upload your best moments for the world to see</li>
        <li><strong>Compete and climb</strong> — join tournaments, represent teams, and rise up the rankings</li>
      </ul>
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
          Log in &amp; get started
        </a>
      </p>
      <p style="margin:0 0 4px;color:#2929db;font-weight:600">Make your sports journey visible.</p>
      <p style="color:#666;font-size:13px">The app: <a href="${APP_URL}">${APP_URL}</a><br/>
         ${security}</p>
    </div>`;
  }

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

// ─── In-app support / contact request ────────────────────────────────────────

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/**
 * Forward an in-app support/contact request to the support inbox (reply-to set to
 * the user's email) and send the user a confirmation copy.
 */
export async function sendSupportRequest({
  fromName, fromEmail, userId, category, subject, message,
}: {
  fromName: string; fromEmail: string; userId: string;
  category: string; subject: string; message: string;
}): Promise<void> {
  const safeMsg = escapeHtml(message).replace(/\n/g, '<br>');
  const meta = `From: ${fromName} <${fromEmail}> (user ${userId})\nCategory: ${category}`;

  // 1) To support
  await sendMail({
    to: env.SUPPORT_EMAIL,
    replyTo: fromEmail,
    subject: `[Support · ${category}] ${subject}`,
    text: `${meta}\n\n${message}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
        <p style="color:#666;font-size:13px;white-space:pre-line">${escapeHtml(meta)}</p>
        <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
        <p>${safeMsg}</p>
      </div>`,
  });

  // 2) Confirmation to the user
  await sendMail({
    to: fromEmail,
    subject: `We received your message — All For 1 Support`,
    text:
      `Hi ${fromName},\n\nThanks for reaching out — we've received your message and will get back to you soon.\n\n` +
      `Your message:\n"${message}"\n\n— The All For 1 team`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
        <h2 style="margin:0 0 16px">We got your message</h2>
        <p>Hi ${escapeHtml(fromName)}, thanks for reaching out — we've received your message and will get back to you soon.</p>
        <p style="color:#666;font-size:13px;border-left:3px solid #eee;padding-left:12px;white-space:pre-line">${safeMsg}</p>
        <p style="margin-top:24px">— The All For 1 team</p>
      </div>`,
  });
}

// ─── Activity notification emails (branded, dark + lime) ──────────────────────

export interface NotificationEmailOptions {
  to: string;
  recipientName: string;
  subject: string;
  heading: string;
  body: string;
  ctaUrl: string;
  ctaLabel: string;
  unsubscribeUrl: string;    // unsubscribe from THIS type
  unsubscribeAllUrl: string; // unsubscribe from all activity emails
  category: string;          // "Endorsements", "Match results", …
}

const managePrefsUrl = `${clientOrigin}/settings/notifications`;

/**
 * A single, well-crafted activity-notification email. Dark surface + lime accent,
 * Archivo/Inter stack with web-safe fallbacks, table layout for client support,
 * a preheader, and a compliant footer with per-type + all unsubscribe links.
 */
export async function sendNotificationEmail(o: NotificationEmailOptions): Promise<void> {
  const H = escapeHtml;
  const font = "'Archivo','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
  const preheader = o.body.slice(0, 140);

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<style>@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@600;700&family=Inter:wght@400;500&display=swap');
  body{margin:0;padding:0;background:#080808;} a{text-decoration:none;}</style></head>
<body style="margin:0;padding:0;background:#080808;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#080808;font-size:1px;line-height:1px;">${H(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#080808;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
        <tr><td style="padding:0 4px 20px;">
          <span style="font-family:${font};font-weight:700;font-size:15px;letter-spacing:3px;color:#dbff5a;">ALL FOR 1</span>
        </td></tr>
        <tr><td style="background:#111111;border:1px solid #1c1c1c;border-radius:16px;padding:32px;">
          <h1 style="margin:0 0 12px;font-family:${font};font-weight:700;font-size:22px;line-height:1.25;color:#ffffff;">${H(o.heading)}</h1>
          <p style="margin:0 0 24px;font-family:${font};font-weight:400;font-size:15px;line-height:1.6;color:#c9c9c9;">${H(o.body)}</p>
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="border-radius:10px;background:#dbff5a;">
              <a href="${H(o.ctaUrl)}" style="display:inline-block;padding:13px 26px;font-family:${font};font-weight:600;font-size:14px;color:#080808;border-radius:10px;">${H(o.ctaLabel)} →</a>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:20px 4px 0;">
          <p style="margin:0 0 6px;font-family:${font};font-size:12px;line-height:1.6;color:#6b6b6b;">
            You're receiving this because your <strong style="color:#8a8a8a;">${H(o.category)}</strong> email notifications are on.
          </p>
          <p style="margin:0;font-family:${font};font-size:12px;line-height:1.6;color:#6b6b6b;">
            <a href="${H(managePrefsUrl)}" style="color:#8a8a8a;text-decoration:underline;">Manage preferences</a> ·
            <a href="${H(o.unsubscribeUrl)}" style="color:#8a8a8a;text-decoration:underline;">Turn off these</a> ·
            <a href="${H(o.unsubscribeAllUrl)}" style="color:#8a8a8a;text-decoration:underline;">Unsubscribe from all</a>
          </p>
          <p style="margin:14px 0 0;font-family:${font};font-size:11px;color:#4a4a4a;">All For 1 — the network for the sports ecosystem</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text =
    `${o.heading}\n\n${o.body}\n\n${o.ctaLabel}: ${o.ctaUrl}\n\n` +
    `— You're receiving this because your ${o.category} email notifications are on.\n` +
    `Manage preferences: ${managePrefsUrl}\nUnsubscribe from these: ${o.unsubscribeUrl}\nUnsubscribe from all: ${o.unsubscribeAllUrl}`;

  await sendMail({
    to: o.to,
    subject: o.subject,
    html,
    text,
    headers: { 'List-Unsubscribe': `<${o.unsubscribeAllUrl}>` },
  });
}

export interface DigestItem { title: string; body: string; url: string }

/** A batched digest email (daily/weekly) — one email listing several items. */
export async function sendDigestEmail(o: {
  to: string; subject: string; heading: string; intro: string;
  items: DigestItem[]; ctaUrl: string; unsubscribeAllUrl: string; managed: string;
}): Promise<void> {
  const H = escapeHtml;
  const font = "'Archivo','Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
  const rows = o.items.map((it) => `
    <tr><td style="padding:12px 0;border-bottom:1px solid #1c1c1c;">
      <a href="${H(it.url)}" style="font-family:${font};font-weight:600;font-size:14px;color:#ffffff;">${H(it.title)}</a>
      <div style="font-family:${font};font-size:13px;color:#c9c9c9;margin-top:2px;">${H(it.body)}</div>
    </td></tr>`).join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta name="color-scheme" content="dark"><style>@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@600;700&family=Inter:wght@400;500&display=swap');body{margin:0;background:#080808;}a{text-decoration:none;}</style></head>
<body style="margin:0;background:#080808;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${H(o.intro)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#080808;padding:32px 16px;"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
      <tr><td style="padding:0 4px 20px;"><span style="font-family:${font};font-weight:700;font-size:15px;letter-spacing:3px;color:#dbff5a;">ALL FOR 1</span></td></tr>
      <tr><td style="background:#111111;border:1px solid #1c1c1c;border-radius:16px;padding:32px;">
        <h1 style="margin:0 0 6px;font-family:${font};font-weight:700;font-size:22px;color:#ffffff;">${H(o.heading)}</h1>
        <p style="margin:0 0 8px;font-family:${font};font-size:14px;color:#c9c9c9;">${H(o.intro)}</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;"><tr><td style="border-radius:10px;background:#dbff5a;">
          <a href="${H(o.ctaUrl)}" style="display:inline-block;padding:13px 26px;font-family:${font};font-weight:600;font-size:14px;color:#080808;border-radius:10px;">Open All For 1 →</a>
        </td></tr></table>
      </td></tr>
      <tr><td style="padding:20px 4px 0;">
        <p style="margin:0;font-family:${font};font-size:12px;color:#6b6b6b;">${H(o.managed)} · <a href="${H(managePrefsUrl)}" style="color:#8a8a8a;text-decoration:underline;">Manage</a> · <a href="${H(o.unsubscribeAllUrl)}" style="color:#8a8a8a;text-decoration:underline;">Unsubscribe from all</a></p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;

  const text = `${o.heading}\n${o.intro}\n\n` + o.items.map((it) => `• ${it.title} — ${it.body}\n  ${it.url}`).join('\n') +
    `\n\nManage: ${managePrefsUrl}\nUnsubscribe from all: ${o.unsubscribeAllUrl}`;

  await sendMail({ to: o.to, subject: o.subject, html, text, headers: { 'List-Unsubscribe': `<${o.unsubscribeAllUrl}>` } });
}
